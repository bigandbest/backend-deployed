# Inventory Management System - Visual Architecture

## System Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ADMIN DASHBOARD                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────┐        ┌────────────────────┐               │
│  │ InventoryMgmt Page │        │ PincodeMgmt Page   │               │
│  ├────────────────────┤        ├────────────────────┤               │
│  │ • Warehouse Select │        │ • Warehouse Select │               │
│  │ • Stock Overview   │        │ • Pincode List     │               │
│  │ • Low Stock Items  │        │ • Add Pincodes     │               │
│  │ • Allocations      │        │ • Coverage Stats   │               │
│  │ • Bulk Upload      │        │ • Delivery Config  │               │
│  │ • Analytics        │        └────────────────────┘               │
│  └────────────────────┘                                             │
│           ↓                                                           │
└─────────────────────────────────────────────────────────────────────┘
           │
           │ HTTP Requests
           ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     API LAYER                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │        inventoryManagementRoutes.js                           │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ GET    /warehouse/:id                                         │  │
│  │ GET    /product/:id/warehouses                               │  │
│  │ POST   /warehouse/:id/update-stock                           │  │
│  │ POST   /warehouse/:id/allocate-to-zonal                      │  │
│  │ GET    /warehouse/:id/low-stock                              │  │
│  │ POST   /warehouse/:id/bulk-update                            │  │
│  │ GET    /warehouse/:id/analytics                              │  │
│  └──────────────────────────────────────────────────────────────┘  │
│           ↓                                                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │        inventoryManagementController.js                       │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ • getWarehouseInventory()                                    │  │
│  │ • getProductInventoryAcrossWarehouses()                      │  │
│  │ • updateWarehouseStock()                                     │  │
│  │ • allocateStockToZonal()                                     │  │
│  │ • getLowStockProducts()                                      │  │
│  │ • bulkUpdateInventory()                                      │  │
│  │ • getInventoryAnalytics()                                    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│           ↓                                                           │
└─────────────────────────────────────────────────────────────────────┘
           │
           │ Data Access
           ↓
┌─────────────────────────────────────────────────────────────────────┐
│                     DAO LAYER                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │    ProductWarehouseStockDAO (product-warehouse-stock.dao.js) │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ • listByProducts() [FIXED]                                   │  │
│  │ • getByProductAndWarehouse()                                 │  │
│  │ • getByVariantAndWarehouse()                                 │  │
│  │ • upsertStock()                                              │  │
│  │ • upsertVariantStock()                                       │  │
│  │ • listByProduct()                                            │  │
│  │ • listByVariant()                                            │  │
│  │ • createMany()                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│           ↓                                                           │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │    ProductDAO (product.dao.js)                                │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │ • addRecommendedStore() [FIXED - upsert logic]               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│           ↓                                                           │
└─────────────────────────────────────────────────────────────────────┘
           │
           │ Prisma ORM
           ↓
┌─────────────────────────────────────────────────────────────────────┐
│                  DATABASE LAYER                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  Tables                                       │  │
│  ├──────────────────────────────────────────────────────────────┤  │
│  │                                                               │  │
│  │  product_warehouse_stock                warehouses           │  │
│  │  ├─ id (PK)                             ├─ id (PK)          │  │
│  │  ├─ product_id (FK)      ─→             ├─ name             │  │
│  │  ├─ warehouse_id (FK)    ─→─────────────┴─ type             │  │
│  │  ├─ variant_id (FK)      ─→             └─ location         │  │
│  │  ├─ stock_quantity                                           │  │
│  │  ├─ reserved_quantity       warehouse_pincodes             │  │
│  │  ├─ minimum_threshold       ├─ warehouse_id (FK) ─→        │  │
│  │  ├─ cost_per_unit           ├─ pincode                      │  │
│  │  └─ last_restocked_at       ├─ city                         │  │
│  │                              ├─ state                        │  │
│  │  products                    └─ delivery_days                │  │
│  │  ├─ id (PK)             ←─────────────────                   │  │
│  │  ├─ name                                                     │  │
│  │  └─ ...                                                      │  │
│  │                                                               │  │
│  │  product_variants                                            │  │
│  │  ├─ id (PK)                                                 │  │
│  │  ├─ product_id (FK)     ←─────────────────                   │  │
│  │  └─ ...                                                      │  │
│  │                                                               │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Warehouse Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                        WAREHOUSE TYPES                            │
└─────────────────────────────────────────────────────────────────┘

ZONAL WAREHOUSE (type: 'zonal')
├── Service Level: Regional distribution
├── Delivery Time: 3-4 days
├── Inventory Type: Large stock pools
├── Geographic Coverage: Multiple zones/states
├── Role: Distribution hub to division warehouses
│
├── INVENTORY STRUCTURE
│   ├── Base Products (variant_id = null)
│   │   └── stock_quantity = 1000
│   ├── Variant A
│   │   └── stock_quantity = 500
│   └── Variant B
│       └── stock_quantity = 500
│
└── SERVICE AREAS
    ├── Zone 1
    │   ├── Pincodes: [110001, 110002, 110003]
    │   └── Cities: Delhi
    ├── Zone 2
    │   ├── Pincodes: [201001, 201002]
    │   └── Cities: Noida, Greater Noida
    └── Zone 3
        ├── Pincodes: [140001, 140002]
        └── Cities: Chandigarh


DIVISION WAREHOUSE (type: 'division')
├── Service Level: Fast, direct delivery
├── Delivery Time: 1 day
├── Inventory Type: Curated stock
├── Geographic Coverage: Specific pincodes
├── Role: Last-mile fulfillment
├── Parent: Links to parent zonal warehouse
│
├── INVENTORY STRUCTURE
│   ├── Base Products
│   │   └── stock_quantity = 200
│   └── Variant A
│       └── stock_quantity = 100
│
└── SERVICE AREAS
    ├── Pincode: 110001
    │   ├── City: Delhi
    │   └── Delivery: 1 day
    └── Pincode: 110002
        ├── City: Delhi
        └── Delivery: 1 day
```

## Stock Allocation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│              DIVISION WAREHOUSE (Stock Source)                   │
│                      stock_qty = 500                             │
│                    Prod-A, Base Variant                          │
└─────────────────────────────────────────────────────────────────┘
           │
           │ Allocate 500 units
           │ ↓
    ┌──────────────────────────────────┐
    │  allocateStockToZonal()           │
    │  ├─ Zonal-1: 150 units           │
    │  ├─ Zonal-2: 200 units           │
    │  └─ Zonal-3: 150 units           │
    └──────────────────────────────────┘
           │
           ├─────────────┬──────────────┬──────────────┐
           ↓             ↓              ↓              ↓
    ┌──────────┐  ┌──────────┐  ┌──────────┐
    │ Zonal-1  │  │ Zonal-2  │  │ Zonal-3  │
    │ +150 qty │  │ +200 qty │  │ +150 qty │
    │ Prod-A   │  │ Prod-A   │  │ Prod-A   │
    └──────────┘  └──────────┘  └──────────┘
        ↓              ↓              ↓
    Serves:        Serves:       Serves:
    States-1       States-2      States-3
    Zones-1        Zones-2       Zones-3
    Pincodes...    Pincodes...   Pincodes...
```

## Variant Stock Management

```
PRODUCT: "Rice 10kg"
├─ Base Variant (variant_id = null)
│  └─ Warehouse Stock
│     ├─ Zonal-1: 500
│     ├─ Division-1: 100
│     └─ Division-2: 150
│
├─ Variant-A: "Premium"
│  └─ Warehouse Stock
│     ├─ Zonal-1: 300
│     ├─ Division-1: 50
│     └─ Division-2: 75
│
└─ Variant-B: "Budget"
   └─ Warehouse Stock
      ├─ Zonal-1: 200
      ├─ Division-1: 30
      └─ Division-2: 45
```

## Analytics Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│                   ANALYTICS DASHBOARD                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  TOTAL      │  │  INVENTORY  │  │  AVAILABLE  │              │
│  │  STOCK      │  │  VALUE      │  │  STOCK      │              │
│  │  5,000      │  │  ₹250,000   │  │  4,800      │              │
│  │  items      │  │             │  │  items      │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                   │
│  ┌─────────────┐                                                 │
│  │  LOW STOCK  │                                                 │
│  │  ITEMS      │                                                 │
│  │  3          │                                                 │
│  │  ⚠️ ACTION  │                                                 │
│  └─────────────┘                                                 │
│                                                                   │
│  BY CATEGORY BREAKDOWN:                                          │
│  ┌──────────────────────────────────────────────┐                │
│  │ Electronics:  2000 units | 20 products       │                │
│  │ Groceries:    3000 units | 25 products       │                │
│  │ Clothing:     0    units | 0  products       │                │
│  └──────────────────────────────────────────────┘                │
│                                                                   │
│  WAREHOUSE TYPE DISTRIBUTION:                                    │
│  ┌──────────────────────────────────────────────┐                │
│  │ Zonal Warehouses:      3,000 units (60%)     │                │
│  │ Division Warehouses:   2,000 units (40%)     │                │
│  └──────────────────────────────────────────────┘                │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Low Stock Alert System

```
┌─────────────────────────────────────────────────────────────────┐
│                    MONITORING LOGIC                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  For each stock record:                                          │
│                                                                   │
│  IF stock_quantity <= minimum_threshold                          │
│     ├─ Mark as LOW STOCK (is_low_stock = true)                   │
│     ├─ Flag in UI with 🔴 red badge                              │
│     ├─ Show in "Low Stock Items" tab                             │
│     ├─ Calculate deficit: minimum_threshold - stock_quantity     │
│     └─ Provide RESTOCK button                                    │
│  ELSE                                                             │
│     ├─ Show as OK (is_low_stock = false)                         │
│     └─ Display with 🟢 green badge                               │
│                                                                   │
│  Query Example:                                                   │
│  WHERE stock_quantity <= minimum_threshold                       │
│  ORDER BY stock_quantity ASC                                     │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## CSV Bulk Import Flow

```
┌────────────────────────────────────────────────────────────────┐
│                 CSV FILE STRUCTURE                              │
├────────────────────────────────────────────────────────────────┤
│                                                                  │
│  product_id,variant_id,stock_quantity,minimum_threshold        │
│  prod-1,,100,10                                                │
│  prod-2,var-1,50,5                                             │
│  prod-3,,200,20                                                │
│  prod-4,var-2,75,8                                             │
│  ...                                                            │
│                                                                  │
└────────────────────────────────────────────────────────────────┘
        │
        │ User clicks "Bulk Upload"
        │ Selects CSV file
        │ ↓
┌────────────────────────────────────────────────────────────────┐
│              FRONTEND PROCESSING                               │
├────────────────────────────────────────────────────────────────┤
│  ✅ Read file as text                                           │
│  ✅ Parse CSV lines (skip header)                              │
│  ✅ Build records array                                        │
│  ✅ Validate data types                                        │
│  └─ POST to backend with progress tracking                     │
└────────────────────────────────────────────────────────────────┘
        │
        │ Progress: [████████████████░░░░] 80%
        │ ↓
┌────────────────────────────────────────────────────────────────┐
│              BACKEND PROCESSING                                │
├────────────────────────────────────────────────────────────────┤
│  ✅ Validate records (product exists, etc.)                    │
│  ✅ Start transaction                                          │
│  ✅ Loop through records:                                      │
│     │  UPSERT into product_warehouse_stock                     │
│     │  ├─ product_id_warehouse_id_variant_id unique key        │
│     │  ├─ Update: stock_quantity, minimum_threshold            │
│     │  └─ Create: new record if not exists                     │
│  ✅ Commit transaction                                         │
│  └─ Return success: "4 records updated"                        │
└────────────────────────────────────────────────────────────────┘
        │
        │ ✅ Success Message
        │ "Successfully imported 4 inventory records"
        │ ↓
└────────────────────────────────────────────────────────────────┐
│         INVENTORY UPDATED                                       │
│  Database now reflects all 4 stock levels for warehouse        │
└────────────────────────────────────────────────────────────────┘
```

## Request Response Cycle

```
FRONTEND                           BACKEND                      DATABASE
│                                  │                            │
│ 1. Warehouse Select              │                            │
│    (user chooses warehouse)       │                            │
│                                  │                            │
├─ GET /inventory/warehouse/:id ──→│                            │
│                                  │ ProductWarehouse          │
│                                  │ StockDAO.listByProducts()  │
│                                  │            ├─→ Prisma ───→│ Query
│                                  │            │    product_warehouse_stock
│                                  │            │    WHERE warehouse_id = ?
│                                  │            │              │
│                                  │            │ ←────────────┤ Results
│                                  │            │              │
│                                  │ Format data                │
│                                  │              ←─────────────┤
│ ←─ Response ────────────────────┤              │              │
│   {inventory: [...]}             │              │              │
│                                  │              │              │
│ 2. Display inventory table       │              │              │
│    with search/filter            │              │              │
│                                  │              │              │
│ 3. User clicks "Add Stock"       │              │              │
│    Opens modal form               │              │              │
│                                  │              │              │
│ 4. User submits form             │              │              │
├─ POST /warehouse/:id/update ────→│              │              │
│   {product_id, qty, threshold}   │ Validate    │              │
│                                  │ input       │              │
│                                  │             │              │
│                                  │ ProductWare│              │
│                                  │ houseStock │              │
│                                  │ DAO.upsert │              │
│                                  │    ├─→ Prisma ───────────→│ Upsert
│                                  │    │    product_warehouse
│                                  │    │         _stock
│                                  │    │              │
│                                  │    │ ←────────────┤ Updated
│                                  │    │    Record
│                                  │ ←──┤              │
│                                  │              │
│ ←─ Success Response ───────────→│              │
│   {success: true, data: {...}}   │              │
│                                  │              │
│ 5. Refresh inventory list        │              │
├─ GET /inventory/warehouse/:id ──→│              │
│                                  │ Fetch       │
│                                  │ updated    │
│                                  │ data       │──→│ Query
│                                  │            │   │
│                                  │            ←───┤ Returns
│                                  │   ←────────────┤ updated
│                                  │                 list
│ ←─ Updated Response ────────────┤              │
│   {inventory: [...]}             │              │
│                                  │              │
│ 6. Update table display          │              │
│    Show success toast            │              │
│                                  │              │
```

---

This visual architecture helps understand:
1. How frontend components connect to backend
2. Database relationships and schema
3. Stock allocation processes
4. Analytics calculations
5. Request/response flows
