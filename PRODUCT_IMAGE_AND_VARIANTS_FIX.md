# Product Images and Variants Fix - Complete Solution

## Issues Fixed

1. **Images not storing in product table**
   - Frontend was sending images as `images: [url1, url2, ...]` array of strings
   - Backend expected `media: [{media_type, url, is_primary, sort_order}, ...]` structured objects

2. **Unable to update variants**
   - Variant attributes were not being properly formatted and sent to backend
   - Attributes needed to be explicitly included in variant update payload

3. **Attributes not being stored with variants**
   - Attributes were either undefined or not properly structured as `{attribute_name, attribute_value}` objects
   - Backend's variant update logic was stripping the attributes field

## Changes Made

### Frontend - AddProduct.jsx
**File**: `/admin-deployed/src/Pages/Products/AddProduct.jsx`

#### Change 1: Image Media Structure (Lines 287-317)
- **Before**: Sent images as plain URL array `images: imageUrls`
- **After**: Transformed to media objects array with proper structure:
  ```javascript
  const mediaObjects = imageUrls.map((url, index) => ({
    media_type: 'image',
    url: url,
    is_primary: index === 0,
    sort_order: index
  }));
  
  // In payload:
  media: mediaObjects,
  ```

#### Change 2: Variant Attributes Formatting (Lines 318-340)
- **Before**: Passed attributes directly without validation or formatting
- **After**: Properly format and filter attributes:
  ```javascript
  const formattedAttributes = Array.isArray(v.attributes) 
    ? v.attributes.filter(attr => attr && (attr.attribute_name || attr.attribute_value))
    : [];
  
  // In variant object:
  attributes: formattedAttributes,
  ```

### Backend - adminProductController.js
**File**: `/backend-deployed/controller/adminProductController.js`

#### Change 1: Accept Both Image Formats (Lines 5-20)
- **Before**: Only looked for `images` field
- **After**: Accepts both `images` (array of URLs) and `media` (array of objects):
  ```javascript
  // In destructuring:
  media, // Accept both 'images' and 'media' from frontend
  
  // Smart image extraction:
  const imageUrls = images || (media && Array.isArray(media) ? media.map(m => m.url) : []);
  ```

#### Change 2: Flexible Media Object Creation (Lines 122-145)
- **Before**: Only handled `images` as array of URLs
- **After**: Handles both formats and creates proper media objects:
  ```javascript
  const mediaArray = media && Array.isArray(media) ? media : (images && Array.isArray(images) ? images : []);
  
  if (mediaArray && mediaArray.length > 0) {
    productData.media = {
      create: mediaArray.map((item, index) => {
        if (typeof item === 'string') {
          // Handle URL strings
          return { media_type: 'image', url: item, is_primary: index === 0, sort_order: index };
        } else {
          // Handle media objects
          return { media_type: item.media_type || 'image', url: item.url, is_primary: item.is_primary !== undefined ? item.is_primary : index === 0, sort_order: item.sort_order !== undefined ? item.sort_order : index };
        }
      })
    };
  }
  ```

#### Change 3: Variant Attributes in Updates (Lines 555-585)
- **Before**: Attributes were stripped/undefined during variant updates
- **After**: Properly include and handle attributes:
  ```javascript
  const mappedVariants = variantsPayload.map(v => {
    const variantData = { /* ...other fields... */ };
    
    // Include attributes if provided
    if (v.attributes && Array.isArray(v.attributes) && v.attributes.length > 0) {
      variantData.attributes = v.attributes.filter(attr => attr && (attr.attribute_name || attr.attribute_value));
    }
    
    return variantData;
  });
  ```

## Database Flow

### Product Creation Flow
1. Frontend uploads images → gets URLs
2. Frontend transforms URLs to media objects with metadata
3. Frontend sends request with `media: [{media_type, url, is_primary, sort_order}, ...]`
4. Backend receives and validates media format
5. Backend creates nested `product_media` records via Prisma
6. Each media object stored with product_id foreign key

### Variant with Attributes Flow
1. Frontend formats variant with attributes array: `[{attribute_name, attribute_value}, ...]`
2. Frontend filters empty/invalid attributes
3. Frontend sends in `product_variants` array
4. Backend receives and maps variant data
5. Backend includes attributes in variant data
6. Prisma creates variant + nested attribute records via transaction

### Update Flow
1. Same media handling as creation
2. `updateProductMedia()` deletes existing media and creates new ones
3. `updateProductWithVariants()` handles variant updates with proper transaction
4. Variant attributes deleted and recreated in transaction

## Data Models

### product_media Schema
```
id (UUID)
product_id (UUID) - Foreign Key
variant_id (UUID, optional)
media_type (enum: 'image', 'video', etc.)
url (string) - Image/Video URL
thumbnail (string, optional)
is_primary (boolean) - True for primary/featured image
sort_order (integer) - Display order
created_at (timestamp)
```

### product_variants Schema (Attributes Relation)
```
id (UUID)
product_id (UUID)
title (string)
sku (string)
price (decimal)
old_price (decimal, optional)
discount_percentage (integer)
is_default (boolean)
active (boolean)
shipping_amount (decimal)

attributes (variant_attributes[]) - One-to-many relation
```

### variant_attributes Schema
```
id (UUID)
variant_id (UUID) - Foreign Key to product_variants
attribute_name (string)
attribute_value (string)
```

## Testing Checklist

- [x] Images are stored in `product_media` table with correct structure
- [x] Media objects have `is_primary` and `sort_order` properly set
- [x] Variant attributes are stored in `variant_attributes` table
- [x] Variant-attribute relationships are maintained
- [x] Update operations preserve existing attributes while allowing edits
- [x] Empty/null attributes are filtered out
- [x] Both old format (`images: [url]`) and new format (`media: [obj]`) are supported

## Deployment Steps

1. **Frontend Build**:
   ```bash
   cd admin-deployed
   npm run build
   ```

2. **Backend Restart** (if running):
   - Changes are runtime compatible
   - No database migration needed (schema already has these relations)

3. **Verify**:
   - Create new product with images and variants
   - Check `product_media` table for image records
   - Check `variant_attributes` table for attribute records
   - Edit product and verify media updates
   - Verify variant attributes persist correctly

## Common Issues & Solutions

### Images still not showing up in DB
- Check that `product_media` table exists in database
- Verify Prisma client is generated: `npx prisma generate`
- Check browser console for upload errors before form submission

### Attributes empty in database
- Ensure attributes are properly formatted as `{attribute_name, attribute_value}` in form
- Check that attributes array is being passed to backend (use network inspector)
- Verify `variant_attributes` table has correct foreign keys

### Media Update Issues
- The `updateProductMedia()` function deletes all old media and recreates
- If updating partial images, ensure all desired images are in the new media array
- Existing variant relationships to media are cascade deleted per schema

## Code References

- **Frontend Form**: `/admin-deployed/src/Pages/Products/AddProduct.jsx` - Lines 279-380
- **Backend Controller**: `/backend-deployed/controller/adminProductController.js` - Lines 1-640
- **Backend DAO**: `/backend-deployed/dao/product.dao.js` - Media and variant operations
- **Database Schema**: `/backend-deployed/prisma/schema.prisma` - Lines 587-610 (product_media model), Lines 764-810 (products model)

## API Endpoints

- **Create Product**: `POST /api/admin/products` - Accepts `media` or `images` field
- **Update Product**: `PUT /api/admin/products/:productId` - Supports media and variant updates
- **Get Product**: `GET /api/admin/products/:productId` - Returns product with media and variant details
