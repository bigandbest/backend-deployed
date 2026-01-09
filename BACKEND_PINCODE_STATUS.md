# Backend Updates for Individual Pincode Status

## Overview
Updated the backend to support individual pincode active/inactive status management, allowing granular control over delivery availability at the pincode level.

## Database Changes

### 1. Existing Schema
The `zone_pincodes` table already has the `is_active` column:
```sql
CREATE TABLE zone_pincodes (
    id SERIAL PRIMARY KEY,
    zone_id INTEGER NOT NULL REFERENCES delivery_zones(id) ON DELETE CASCADE,
    pincode VARCHAR(10) NOT NULL,
    city VARCHAR(100),
    state VARCHAR(50),
    is_active BOOLEAN DEFAULT TRUE,  -- ✅ Already exists
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(zone_id, pincode)
);
```

### 2. Additional Location Fields Migration
**File**: `/backend-deployed/database/add_pincode_location_fields.sql`

Added missing location fields to support detailed pincode information:
```sql
ALTER TABLE zone_pincodes 
ADD COLUMN IF NOT EXISTS district VARCHAR(100),
ADD COLUMN IF NOT EXISTS location_name VARCHAR(150),
ADD COLUMN IF NOT EXISTS village VARCHAR(100),
ADD COLUMN IF NOT EXISTS others TEXT;
```

**To apply this migration**:
```bash
cd backend-deployed
psql -U your_username -d your_database_name -f database/add_pincode_location_fields.sql
```

## Controller Changes

### File Modified
**File**: `/backend-deployed/controller/zoneController.js`

### 1. createZone Function (Line 443-454)

**Before**:
```javascript
const pincodesToInsert = pincodes.map((pincode) => ({
  zone_id: zoneData.id,
  pincode: pincode.pincode,
  city: pincode.city || null,
  state: pincode.state || null,
  district: pincode.district || null,
  location_name: pincode.location_name || null,
  village: pincode.village || null,
  others: pincode.others || null,
  is_active: true,  // ❌ Hardcoded
}));
```

**After**:
```javascript
const pincodesToInsert = pincodes.map((pincode) => ({
  zone_id: zoneData.id,
  pincode: pincode.pincode,
  city: pincode.city || null,
  state: pincode.state || null,
  district: pincode.district || null,
  location_name: pincode.location_name || null,
  village: pincode.village || null,
  others: pincode.others || null,
  is_active: pincode.is_active !== undefined ? pincode.is_active : true,  // ✅ Uses request value
}));
```

### 2. updateZone Function (Line 540-549)

**Before**:
```javascript
const pincodesToInsert = pincodes.map((pincode) => ({
  zone_id: parseInt(id),
  pincode: pincode.pincode,
  city: pincode.city || null,
  state: pincode.state || null,
  district: pincode.district || null,
  location_name: pincode.location_name || null,
  village: pincode.village || null,
  others: pincode.others || null,
  is_active: true,  // ❌ Hardcoded
}));
```

**After**:
```javascript
const pincodesToInsert = pincodes.map((pincode) => ({
  zone_id: parseInt(id),
  pincode: pincode.pincode,
  city: pincode.city || null,
  state: pincode.state || null,
  district: pincode.district || null,
  location_name: pincode.location_name || null,
  village: pincode.village || null,
  others: pincode.others || null,
  is_active: pincode.is_active !== undefined ? pincode.is_active : true,  // ✅ Uses request value
}));
```

## API Request/Response Format

### Create Zone Request
```json
POST /api/zones
{
  "name": "delhi_ncr",
  "display_name": "Delhi NCR",
  "description": "Delhi National Capital Region",
  "is_nationwide": false,
  "pincodes": [
    {
      "pincode": "110001",
      "city": "New Delhi",
      "state": "Delhi",
      "district": "Central Delhi",
      "location_name": "Connaught Place",
      "village": "",
      "others": "",
      "is_active": true  // ✅ Individual pincode status
    },
    {
      "pincode": "110002",
      "city": "New Delhi",
      "state": "Delhi",
      "district": "North Delhi",
      "location_name": "Kashmere Gate",
      "village": "",
      "others": "",
      "is_active": false  // ✅ Can be inactive
    }
  ]
}
```

### Update Zone Request
```json
PUT /api/zones/:id
{
  "name": "delhi_ncr",
  "display_name": "Delhi NCR Updated",
  "description": "Updated description",
  "is_active": true,
  "pincodes": [
    {
      "pincode": "110001",
      "city": "New Delhi",
      "state": "Delhi",
      "district": "Central Delhi",
      "location_name": "Connaught Place",
      "village": "",
      "others": "",
      "is_active": true  // ✅ Can toggle individual pincodes
    }
  ]
}
```

### Get Zone Response
```json
{
  "success": true,
  "zone": {
    "id": 1,
    "name": "delhi_ncr",
    "display_name": "Delhi NCR",
    "is_nationwide": false,
    "is_active": true,
    "pincodes": [
      {
        "id": 1,
        "pincode": "110001",
        "city": "New Delhi",
        "state": "Delhi",
        "district": "Central Delhi",
        "location_name": "Connaught Place",
        "village": "",
        "others": "",
        "is_active": true  // ✅ Individual status returned
      },
      {
        "id": 2,
        "pincode": "110002",
        "city": "New Delhi",
        "state": "Delhi",
        "district": "North Delhi",
        "location_name": "Kashmere Gate",
        "village": "",
        "others": "",
        "is_active": false  // ✅ Individual status returned
      }
    ]
  }
}
```

## Validation Logic

### Default Behavior
- If `is_active` is not provided in the request, it defaults to `true`
- This ensures backward compatibility with existing code

### Validation Rules
1. **Zone Level**: Zone's `is_active` status controls the entire zone
2. **Pincode Level**: Each pincode has its own `is_active` status
3. **Hierarchy**: If zone is inactive, all pincodes are effectively inactive regardless of individual status
4. **Nationwide Zones**: Don't have pincodes, so individual pincode status doesn't apply

## Testing

### Test Cases

#### 1. Create Zone with Mixed Pincode Status
```bash
curl -X POST http://localhost:8000/api/zones \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test_zone",
    "display_name": "Test Zone",
    "is_nationwide": false,
    "pincodes": [
      {"pincode": "110001", "city": "Delhi", "state": "Delhi", "is_active": true},
      {"pincode": "110002", "city": "Delhi", "state": "Delhi", "is_active": false}
    ]
  }'
```

#### 2. Update Zone and Toggle Pincode Status
```bash
curl -X PUT http://localhost:8000/api/zones/1 \
  -H "Content-Type: application/json" \
  -d '{
    "pincodes": [
      {"pincode": "110001", "city": "Delhi", "state": "Delhi", "is_active": false}
    ]
  }'
```

#### 3. Verify Pincode Status
```bash
curl http://localhost:8000/api/zones/1
```

## Migration Steps

### 1. Apply Database Migration
```bash
cd backend-deployed
psql -U your_username -d your_database_name -f database/add_pincode_location_fields.sql
```

### 2. Restart Backend Server
The backend changes are already applied. Just restart the server:
```bash
# If using npm
npm restart

# Or stop and start
# Ctrl+C to stop
npm start
```

### 3. Verify Changes
Check that the backend properly handles pincode status:
```bash
# Create a test zone
curl -X POST http://localhost:8000/api/zones \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test_status",
    "display_name": "Test Status",
    "pincodes": [
      {"pincode": "123456", "is_active": false}
    ]
  }'
```

## Backward Compatibility

✅ **Fully Backward Compatible**
- Existing zones without `is_active` in pincodes will default to `true`
- Old API calls without `is_active` field will work normally
- Database already has the `is_active` column with DEFAULT TRUE

## Benefits

1. **Granular Control**: Manage delivery at pincode level
2. **Flexibility**: Enable/disable specific areas without deleting data
3. **Better Service Management**: Quick response to operational issues
4. **Data Preservation**: Keep pincode data even when temporarily disabled
5. **API Consistency**: Same pattern as zone-level active status

## Files Modified

1. ✅ `/backend-deployed/controller/zoneController.js` - Updated createZone and updateZone
2. ✅ `/backend-deployed/database/add_pincode_location_fields.sql` - Migration for additional fields

## Files Created

1. ✅ `/backend-deployed/database/add_pincode_location_fields.sql` - Database migration
2. ✅ `/backend-deployed/BACKEND_PINCODE_STATUS.md` - This documentation

## Next Steps

1. Apply the database migration
2. Restart the backend server
3. Test the functionality in the admin panel
4. Verify pincode status is properly saved and retrieved
5. Check that delivery validation respects pincode status
