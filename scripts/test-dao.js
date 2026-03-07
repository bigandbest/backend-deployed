import SellerDAO from '../dao/seller.dao.js';

async function main() {
    try {
        const stats = await SellerDAO.getDashboardStats('4679cc79-9ef2-4855-a920-9d9063b3bdcb');
        console.log(JSON.stringify(stats, null, 2));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}
main();
