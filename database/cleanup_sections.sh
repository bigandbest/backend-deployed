#!/bin/bash

# Product Sections Cleanup Script
# This script removes unwanted product sections from the database

echo "🗑️  Product Sections Cleanup"
echo "================================"
echo ""
echo "This will remove the following sections:"
echo "  - you_may_like (You May Like)"
echo "  - athletes (Athletes)"
echo "  - event_elevate (Event Elevate)"
echo "  - shop_goals (Shop Goals)"
echo "  - refresh_workspace (Refresh Workspace)"
echo "  - instagram_reels (Instagram Reels)"
echo ""
echo "The following sections will be KEPT:"
echo "  ✅ dual_deals (Dual Deals)"
echo "  ✅ dual_deals_left (Dual Deals - Left)"
echo "  ✅ dual_deals_right (Dual Deals - Right)"
echo ""
read -p "Do you want to proceed? (y/n) " -n 1 -r
echo ""

if [[ $REPLY =~ ^[Yy]$ ]]
then
    echo "Applying changes to database..."
    
    # Check if DATABASE_URL is set
    if [ -z "$DATABASE_URL" ]; then
        echo "⚠️  DATABASE_URL not set. Please provide database connection details:"
        read -p "Database host (default: localhost): " DB_HOST
        DB_HOST=${DB_HOST:-localhost}
        read -p "Database port (default: 5432): " DB_PORT
        DB_PORT=${DB_PORT:-5432}
        read -p "Database name: " DB_NAME
        read -p "Database user: " DB_USER
        read -sp "Database password: " DB_PASS
        echo ""
        
        export PGPASSWORD=$DB_PASS
        psql -h $DB_HOST -p $DB_PORT -U $DB_USER -d $DB_NAME -f database/remove_sections.sql
    else
        # Use DATABASE_URL
        psql $DATABASE_URL -f database/remove_sections.sql
    fi
    
    if [ $? -eq 0 ]; then
        echo ""
        echo "✅ Successfully removed unwanted product sections!"
        echo ""
        echo "Next steps:"
        echo "1. Check the admin panel Product Sections page"
        echo "2. Verify the removed sections are gone"
        echo "3. Confirm dual_deals sections are still present"
    else
        echo ""
        echo "❌ Error applying changes. Please check the error message above."
        echo ""
        echo "You can manually run the SQL script:"
        echo "  psql -U your_user -d your_database -f database/remove_sections.sql"
    fi
else
    echo "Operation cancelled."
fi
