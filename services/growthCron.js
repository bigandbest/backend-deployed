import cron from "node-cron";
import {
  processReturnWindowExpirations,
  processExpiredRewards,
  sendExpiryReminders,
} from "./referralService.js";
import { processCommissionAutoApproval } from "./affiliateService.js";
import { processMembershipLapses } from "./membershipService.js";

// Prevents overlapping runs of the same job within this process if one run overruns its interval.
const runExclusive = (label, fn) => {
  let isRunning = false;
  return async () => {
    if (isRunning) return;
    isRunning = true;
    try {
      const result = await fn();
      console.log(`[growth-cron] ${label}:`, result);
    } catch (err) {
      console.error(`[growth-cron] ${label} failed:`, err.message);
    } finally {
      isRunning = false;
    }
  };
};

export const initializeGrowthCronJobs = () => {
  // PM2 runs this app as multiple cluster instances — only one instance should run these jobs.
  const instanceId = process.env.NODE_APP_INSTANCE;
  if (instanceId !== undefined && instanceId !== "0") {
    console.log(`[growth-cron] Skipping registration on instance ${instanceId} (only instance 0 runs growth crons)`);
    return;
  }

  cron.schedule("0 * * * *", runExclusive("referral return-window expiry", processReturnWindowExpirations));
  cron.schedule("0 * * * *", runExclusive("affiliate commission auto-approval", processCommissionAutoApproval));
  cron.schedule("0 * * * *", runExclusive("membership trial lapse", processMembershipLapses));
  cron.schedule("0 0 * * *", runExclusive("referral reward expiry", processExpiredRewards));
  cron.schedule("0 9 * * *", runExclusive("referral expiry reminders", sendExpiryReminders));

  console.log("[growth-cron] Referral/affiliate lifecycle jobs scheduled");
};
