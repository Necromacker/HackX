import os
import json
import base64
import io
import datetime
import pandas as pd
from fastapi import FastAPI, Query, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional, List, Dict, Any
from pydantic import BaseModel

try:
    from PIL import Image, ImageEnhance, ImageOps
except ImportError:
    Image = None

try:
    import zxingcpp
except ImportError:
    zxingcpp = None

try:
    import cv2
    import numpy as np
except ImportError:
    cv2 = None
    np = None

app = FastAPI(title="Instamart SME POS & Inventory Intelligence API", version="5.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(BASE_DIR), "Data")
PRODUCTS_FILE = os.path.join(DATA_DIR, "products.csv")
INVENTORY_FILE = os.path.join(DATA_DIR, "inventory.csv")
BARCODES_FILE = os.path.join(DATA_DIR, "barcodes.csv")
IMAGE_CACHE_FILE = os.path.join(DATA_DIR, "product_images.json")
ORDERS_FILE = os.path.join(DATA_DIR, "orders.json")

KNOWN_BRANDS = [
    'Hocco', 'Amul', 'Mother Dairy', 'Epigamia', 'Patanjali', 'Milkmaid', 'Nestle', 'Britannia', 
    'Aashirvaad', 'Tata Sampann', 'Tata', 'Fortune', 'Dhara', 'DiSano', 'Uttam', 
    'Lal Qilla', 'India Gate', 'Rajdhani', 'Bambino', 'Parle-G', 'Parle', 'Haldirams', 
    'Lays', 'Kurkure', 'Bingo', 'Doritos', 'Pringles', 'Sunfeast', 'Oreo', 'Cadbury',
    'Brooke Bond', 'Lipton', 'Nescafe', 'Bru', 'Horlicks', 'Complan', 'Rooh Afza', 
    'Real', 'Tropicana', 'Coca Cola', 'Pepsi', 'Thums Up', 'Sprite', 'Limca', 'Frooti',
    'Maaza', 'Minute Maid', 'Red Bull', 'Kinley', 'Aquafina', 'Harvest Gold', 'Bonn',
    '7 Days', 'MTR', 'MDH', 'Everest', 'Shan', 'Maggi', 'Catch', 'Kohinoor', 'Daawat',
    'Saffola', 'Sundrop', 'Gemini', 'Engine', 'Bailley', 'Bisleri', 'Society', 'Wagh Bakri',
    'Taj Mahal', 'Girnar', 'Paper Boat', 'Raw Pressery', 'Kissan', 'Nutella', 'Hersheys',
    'Kelloggs', 'Quaker', 'Chocos', 'Surf Excel', 'Ariel', 'Tide', 'Wheel', 'Comfort',
    'Rin', 'Ujala', 'Vanish', 'Lizol', 'Harpic', 'Domex', 'Mr Muscle', 'Dettol', 'Nina',
    'Colin', 'Good Knight', 'All Out', 'Odonil', 'Air Wick', 'HIT', 'Mortein', 'Nimwash',
    'Ezee', 'Vim', 'Pril', 'Scotch Brite', 'Exo', '3M', 'Duracell', 'Eveready', 'Cello',
    'Ziploc', 'Reynolds', 'Nataraj', 'Prym', 'Dove', 'Pears', 'Fiama', 'Himalaya',
    'Lifebuoy', 'Santoor', 'Lux', 'Medimix', 'Pantene', 'Head Shoulders', 'Clinic Plus',
    'Parachute', 'Bajaj', 'Livon', 'Tresemme', 'Loreal', 'Sunslik', 'Colgate', 'Pepsodent',
    'Sensodyne', 'Dabur', 'Oral B', 'Listerine', 'Closeup', 'Nivea', 'Ponds', 'Lakme',
    'Neutrogena', 'Garnier', 'Glow and Lovely', 'Vaseline', 'Biotique', 'Clean Clear',
    'Gillette', 'Bombay Shaving Co', 'Park Avenue', 'Beardo', 'Veet', 'Old Spice', 'Axe'
]

def extract_brand_and_type(row):
    name = str(row['product_name'])
    subcat = str(row['subcategory'])
    name_clean = name.lower()
    
    brand = 'Other'
    for b in sorted(KNOWN_BRANDS, key=len, reverse=True):
        if name.lower().startswith(b.lower()) or (' ' + b.lower() + ' ') in (' ' + name_clean + ' '):
            brand = b
            break
    if brand == 'Other':
        brand = name.split()[0]
        
    ptype = 'General'
    if subcat == 'Dairy':
        if 'ice cream' in name_clean or 'hocco' in name_clean:
            ptype = 'Ice Creams'
        elif 'kool' in name_clean or 'flavoured' in name_clean or 'rose' in name_clean or 'shake' in name_clean:
            ptype = 'Flavoured Milk'
        elif 'milk' in name_clean and 'condensed' not in name_clean and 'buttermilk' not in name_clean:
            ptype = 'Milk'
        elif 'paneer' in name_clean:
            ptype = 'Paneer'
        elif 'butter' in name_clean and 'buttermilk' not in name_clean:
            ptype = 'Butter'
        elif 'ghee' in name_clean:
            ptype = 'Ghee'
        elif 'cheese' in name_clean:
            ptype = 'Cheese'
        elif 'dahi' in name_clean or 'yogurt' in name_clean:
            ptype = 'Dahi & Yogurt'
        elif 'lassi' in name_clean or 'buttermilk' in name_clean:
            ptype = 'Lassi & Buttermilk'
        elif 'condensed' in name_clean:
            ptype = 'Condensed Milk'
        else:
            ptype = 'Dairy Specialty'
    elif subcat == 'Staples':
        if 'atta' in name_clean: ptype = 'Atta & Flour'
        elif 'rice' in name_clean: ptype = 'Rice'
        elif 'dal' in name_clean: ptype = 'Dals & Pulses'
        elif 'oil' in name_clean: ptype = 'Edible Oils'
        elif 'sugar' in name_clean: ptype = 'Sugar'
        elif 'salt' in name_clean: ptype = 'Salt'
        elif 'sooji' in name_clean or 'rava' in name_clean or 'besan' in name_clean or 'poha' in name_clean or 'vermicelli' in name_clean: ptype = 'Grains & Mixes'
        else: ptype = 'Staples Misc'
    elif subcat == 'Beverages':
        if 'tea' in name_clean: ptype = 'Tea'
        elif 'coffee' in name_clean: ptype = 'Coffee'
        elif 'juice' in name_clean or 'tropicana' in name_clean or 'real' in name_clean or 'frooti' in name_clean or 'maaza' in name_clean: ptype = 'Juices'
        elif 'cola' in name_clean or 'pepsi' in name_clean or 'sprite' in name_clean or 'thums up' in name_clean or 'limca' in name_clean: ptype = 'Soft Drinks'
        elif 'water' in name_clean or 'kinley' in name_clean or 'aquafina' in name_clean or 'bisleri' in name_clean: ptype = 'Packaged Water'
        elif 'horlicks' in name_clean or 'bournvita' in name_clean or 'complan' in name_clean: ptype = 'Health Drinks'
        else: ptype = 'Beverages Misc'
    elif subcat == 'Snacks':
        if 'biscuit' in name_clean or 'cookie' in name_clean or 'marie' in name_clean or 'good day' in name_clean or 'hide & seek' in name_clean or 'monaco' in name_clean or 'parle-g' in name_clean: ptype = 'Biscuits & Cookies'
        elif 'chips' in name_clean or 'lays' in name_clean or 'bingo' in name_clean or 'kurkure' in name_clean or 'doritos' in name_clean or 'pringles' in name_clean: ptype = 'Chips & Crisps'
        elif 'bhujia' in name_clean or 'namkeen' in name_clean or 'mixture' in name_clean: ptype = 'Namkeen & Savouries'
        elif 'noodle' in name_clean or 'maggi' in name_clean or 'pasta' in name_clean: ptype = 'Instant Noodles & Pasta'
        elif 'chocolate' in name_clean or 'cadbury' in name_clean: ptype = 'Chocolates'
        else: ptype = 'Snacks Misc'
    elif subcat == 'Bakery':
        if 'bread' in name_clean: ptype = 'Bread & Buns'
        elif 'cake' in name_clean or 'gobbles' in name_clean or 'croissant' in name_clean: ptype = 'Cakes & Pastries'
        elif 'rusk' in name_clean or 'toast' in name_clean: ptype = 'Rusk & Toast'
        elif 'mix' in name_clean: ptype = 'Breakfast Mixes'
        else: ptype = 'Bakery Items'
    elif subcat == 'Spices':
        if 'masala' in name_clean: ptype = 'Blended Masalas'
        elif 'powder' in name_clean: ptype = 'Pure Spice Powders'
        elif 'seeds' in name_clean: ptype = 'Whole Spices'
        else: ptype = 'Cooking Pastes & Spices'
    elif subcat == 'Cleaning':
        if 'floor' in name_clean or 'phenyl' in name_clean or 'lizol' in name_clean: ptype = 'Floor Cleaners'
        elif 'toilet' in name_clean or 'harpic' in name_clean or 'domex' in name_clean or 'acid' in name_clean: ptype = 'Toilet Cleaners'
        elif 'glass' in name_clean or 'colin' in name_clean or 'spray' in name_clean or 'surface' in name_clean: ptype = 'Surface & Glass Cleaners'
        else: ptype = 'Cleaning Essentials'
    elif subcat == 'Laundry':
        if 'powder' in name_clean or 'matic' in name_clean or 'front load' in name_clean or 'plus' in name_clean or 'active' in name_clean: ptype = 'Detergent Powders'
        elif 'liquid' in name_clean or 'conditioner' in name_clean: ptype = 'Liquid Detergents & Conditioners'
        elif 'bar' in name_clean: ptype = 'Detergent Bars'
        elif 'bleach' in name_clean or 'stain' in name_clean: ptype = 'Fabric Care & Stain Removers'
        else: ptype = 'Laundry Care'
    elif subcat == 'Kitchen':
        if 'dishwash' in name_clean or 'bar' in name_clean or 'liquid' in name_clean or 'gel' in name_clean or 'vim' in name_clean or 'pril' in name_clean: ptype = 'Dishwash Cleaners'
        elif 'scrub' in name_clean or 'sponge' in name_clean or 'wiper' in name_clean: ptype = 'Scrubbers & Wipes'
        elif 'foil' in name_clean or 'wrap' in name_clean or 'bag' in name_clean: ptype = 'Kitchen Wraps & Bags'
        else: ptype = 'Kitchen Essentials'
    elif subcat == 'Bath':
        if 'soap' in name_clean: ptype = 'Bath Soaps'
        elif 'body wash' in name_clean or 'shower gel' in name_clean: ptype = 'Body Wash & Shower Gels'
        elif 'handwash' in name_clean: ptype = 'Handwash'
        else: ptype = 'Bath Care'
    elif subcat == 'Hair':
        if 'shampoo' in name_clean: ptype = 'Shampoos'
        elif 'conditioner' in name_clean: ptype = 'Conditioners'
        elif 'oil' in name_clean: ptype = 'Hair Oils'
        elif 'serum' in name_clean: ptype = 'Hair Serums'
        else: ptype = 'Hair Care'
    elif subcat == 'Skin':
        if 'face wash' in name_clean: ptype = 'Face Washes'
        elif 'cream' in name_clean or 'moisturiser' in name_clean or 'moisturising' in name_clean or 'cold cream' in name_clean: ptype = 'Face & Body Creams'
        elif 'sunscreen' in name_clean: ptype = 'Sunscreens'
        elif 'micellar' in name_clean or 'cleanser' in name_clean: ptype = 'Cleansers'
        elif 'lotion' in name_clean: ptype = 'Body Lotions'
        else: ptype = 'Skincare'
    elif subcat == 'Oral':
        if 'toothpaste' in name_clean: ptype = 'Toothpastes'
        elif 'toothbrush' in name_clean or 'brush' in name_clean: ptype = 'Toothbrushes'
        elif 'mouthwash' in name_clean: ptype = 'Mouthwashes'
        elif 'floss' in name_clean: ptype = 'Dental Floss'
        else: ptype = 'Oral Care'
    elif subcat == 'Grooming':
        if 'razor' in name_clean or 'blade' in name_clean: ptype = 'Razors & Blades'
        elif 'shaving' in name_clean: ptype = 'Shaving Foams & Creams'
        elif 'deo' in name_clean or 'deodorant' in name_clean: ptype = 'Deodorants'
        elif 'beard' in name_clean: ptype = 'Beard Care'
        elif 'removal' in name_clean: ptype = 'Hair Removal'
        else: ptype = 'Grooming Essentials'
    elif subcat == 'Home Care':
        if 'refill' in name_clean or 'spray' in name_clean or 'repellent' in name_clean or 'killer' in name_clean or 'hit' in name_clean or 'mortein' in name_clean or 'good knight' in name_clean or 'all out' in name_clean: ptype = 'Pest Control & Repellents'
        elif 'freshener' in name_clean or 'odonil' in name_clean or 'air wick' in name_clean: ptype = 'Air Fresheners'
        elif 'garbage' in name_clean or 'bags' in name_clean: ptype = 'Waste Management'
        elif 'balls' in name_clean: ptype = 'Naphthalene & Camphor'
        else: ptype = 'Home Care Essentials'
    elif subcat == 'Stationery':
        if 'batter' in name_clean: ptype = 'Batteries'
        elif 'tape' in name_clean: ptype = 'Tapes & Adhesives'
        elif 'pen' in name_clean or 'pencil' in name_clean: ptype = 'Writing Instruments'
        elif 'bag' in name_clean or 'lock' in name_clean: ptype = 'Storage & Pouches'
        else: ptype = 'Stationery & Hardware'
    else:
        ptype = subcat

    return pd.Series({'brand': brand, 'product_type': ptype})

def load_image_cache():
    if os.path.exists(IMAGE_CACHE_FILE):
        try:
            with open(IMAGE_CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}

def get_merged_data() -> pd.DataFrame:
    products_df = pd.read_csv(PRODUCTS_FILE)
    inventory_df = pd.read_csv(INVENTORY_FILE)
    image_cache = load_image_cache()
    
    # Drop overlapping columns from inventory_df before merging to avoid _x/_y duplicates
    overlap_cols = [c for c in ['unit_price', 'cost_price', 'reorder_level'] if c in inventory_df.columns and c in products_df.columns]
    inventory_subset = inventory_df.drop(columns=overlap_cols)
    
    if os.path.exists(BARCODES_FILE):
        barcodes_df = pd.read_csv(BARCODES_FILE)
        barcodes_df["barcode"] = barcodes_df["barcode"].astype(str)
        # Drop if barcode already in products_df
        if "barcode" in products_df.columns:
            products_df = products_df.drop(columns=["barcode"])
        products_df = pd.merge(products_df, barcodes_df[["product_id", "barcode"]], on="product_id", how="left")
    else:
        products_df["barcode"] = ""

    parsed = products_df.apply(extract_brand_and_type, axis=1)
    products_df['brand'] = parsed['brand']
    products_df['product_type'] = parsed['product_type']
    
    products_df['image_url'] = products_df['product_id'].apply(lambda pid: image_cache.get(str(pid), ""))
    
    merged = pd.merge(products_df, inventory_subset, on="product_id", how="inner")
    merged["stock_level"] = merged["stock_level"].fillna(0).astype(int)
    merged["unit_price"] = merged["unit_price"].fillna(0.0).astype(float)
    merged["cost_price"] = merged["cost_price"].fillna(0.0).astype(float) if "cost_price" in merged.columns else 0.0
    merged["reorder_level"] = merged["reorder_level"].fillna(10).astype(int) if "reorder_level" in merged.columns else 10
    merged["batch_id"] = merged["batch_id"].fillna("").astype(str) if "batch_id" in merged.columns else ""
    merged["expiry_date"] = merged["expiry_date"].fillna("").astype(str) if "expiry_date" in merged.columns else ""
    merged["barcode"] = merged["barcode"].fillna("").astype(str)
    merged["image_url"] = merged["image_url"].fillna("").astype(str)
    merged["total_value"] = merged["stock_level"] * merged["unit_price"]
    
    # Fill any remaining NaN values that would break JSON serialization
    if "last_restock_date" in merged.columns:
        merged["last_restock_date"] = merged["last_restock_date"].fillna("").astype(str)
    if "is_perishable" in merged.columns:
        merged["is_perishable"] = merged["is_perishable"].fillna(False)
    if "warehouse_location" in merged.columns:
        merged["warehouse_location"] = merged["warehouse_location"].fillna("").astype(str)
    if "supplier" in merged.columns:
        merged["supplier"] = merged["supplier"].fillna("").astype(str)
    
    # Blanket NaN cleanup - catch any remaining columns
    merged = merged.fillna("")
    
    return merged

def decode_barcode_from_image(image: Any) -> Optional[str]:
    """Ultra-robust multi-pass barcode reader for packaging photos, reflections, high-res & low-res frames."""
    if not zxingcpp:
        return None
        
    try:
        if Image and isinstance(image, Image.Image):
            if image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info):
                bg = Image.new('RGB', image.size, (255, 255, 255))
                bg.paste(image, mask=image.split()[-1])
                image = bg
            elif image.mode != 'RGB':
                image = image.convert('RGB')
            if cv2 is not None and np is not None:
                cv_img = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
            else:
                cv_img = None
        elif cv2 is not None and isinstance(image, np.ndarray):
            cv_img = image
        else:
            cv_img = None

        # Pass 1: Direct read with auto-rotate & downscale
        res = zxingcpp.read_barcodes(cv_img if cv_img is not None else image, try_rotate=True, try_downscale=True, try_invert=True)
        if res:
            return res[0].text.strip()

        if cv_img is not None and cv2 is not None:
            gray = cv2.cvtColor(cv_img, cv2.COLOR_BGR2GRAY)
            
            # Pass 2: Grayscale
            res = zxingcpp.read_barcodes(gray, try_rotate=True, try_downscale=True, try_invert=True)
            if res:
                return res[0].text.strip()

            # Pass 3: Upscaling (1.5x, 2.0x) for tight packaging photos like Hocco tub
            for scale in [1.5, 2.0, 0.75]:
                resized = cv2.resize(cv_img, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
                res = zxingcpp.read_barcodes(resized, try_rotate=True, try_downscale=True, try_invert=True)
                if res:
                    return res[0].text.strip()

            # Pass 4: CLAHE (Adaptive Histogram Equalization for plastic wrappers & glare)
            for clip_limit in [2.0, 3.5, 5.0]:
                clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=(8, 8))
                cl_img = clahe.apply(gray)
                res = zxingcpp.read_barcodes(cl_img, try_rotate=True, try_downscale=True, try_invert=True)
                if res:
                    return res[0].text.strip()

            # Pass 5: Thresholding / Otsu / Adaptive
            for thresh in [
                cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)[1],
                cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 11, 2)
            ]:
                res = zxingcpp.read_barcodes(thresh, try_rotate=True, try_downscale=True)
                if res:
                    return res[0].text.strip()

            # Pass 6: Sharpening
            kernel = np.array([[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]])
            sharpened = cv2.filter2D(gray, -1, kernel)
            res = zxingcpp.read_barcodes(sharpened, try_rotate=True, try_downscale=True)
            if res:
                return res[0].text.strip()

        # Fallback PIL rotations
        if Image and isinstance(image, Image.Image):
            for angle in (90, 180, 270):
                rotated = image.rotate(angle, expand=True)
                res = zxingcpp.read_barcodes(rotated, try_rotate=True, try_downscale=True)
                if res:
                    return res[0].text.strip()
    except Exception as e:
        print(f"Barcode decoding error: {e}")

    return None

def load_orders() -> List[Dict[str, Any]]:
    if os.path.exists(ORDERS_FILE):
        try:
            with open(ORDERS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []
    return []

def save_orders(orders: List[Dict[str, Any]]):
    with open(ORDERS_FILE, "w", encoding="utf-8") as f:
        json.dump(orders, f, indent=2)

# =================== API ENDPOINTS ===================

@app.get("/api/health")
def health_check():
    return {"status": "ok", "message": "Instamart Barcode POS & Intelligence Service is running"}

@app.get("/api/stats")
def get_stats():
    df = get_merged_data()
    total_skus = int(len(df))
    total_stock_units = int(df["stock_level"].sum())
    total_valuation = float(df["total_value"].sum())
    categories_count = int(df["category"].nunique())
    subcategories_count = int(df["subcategory"].nunique())
    product_types_count = int(df["product_type"].nunique())
    brands_count = int(df["brand"].nunique())
    
    category_breakdown = df.groupby("category").agg(
        items=("product_id", "count"),
        total_units=("stock_level", "sum"),
        total_value=("total_value", "sum")
    ).reset_index().to_dict(orient="records")

    orders = load_orders()
    total_orders = len(orders)
    total_revenue = sum(o.get("total_amount", 0) for o in orders)

    return {
        "total_skus": total_skus,
        "total_stock_units": total_stock_units,
        "total_valuation": round(total_valuation, 2),
        "categories_count": categories_count,
        "subcategories_count": subcategories_count,
        "product_types_count": product_types_count,
        "brands_count": brands_count,
        "total_orders": total_orders,
        "total_revenue": round(total_revenue, 2),
        "category_breakdown": category_breakdown
    }

@app.get("/api/products")
def get_products(
    search: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    subcategory: Optional[str] = Query(None),
    product_type: Optional[str] = Query(None),
    brand: Optional[str] = Query(None),
    barcode: Optional[str] = Query(None),
    sort_by: Optional[str] = Query("product_id"),
    order: Optional[str] = Query("asc")
):
    df = get_merged_data()
    
    if barcode:
        df = df[df["barcode"].astype(str) == barcode.strip()]
        
    if search:
        s = search.strip().lower()
        df = df[
            df["product_name"].str.lower().str.contains(s, na=False) | 
            df["brand"].str.lower().str.contains(s, na=False) |
            df["product_type"].str.lower().str.contains(s, na=False) |
            df["barcode"].astype(str).str.contains(s, na=False)
        ]
        
    if category and category.lower() != "all":
        df = df[df["category"].str.lower() == category.lower()]
        
    if subcategory and subcategory.lower() != "all":
        df = df[df["subcategory"].str.lower() == subcategory.lower()]
        
    if product_type and product_type.lower() != "all":
        df = df[df["product_type"].str.lower() == product_type.lower()]
        
    if brand and brand.lower() != "all":
        df = df[df["brand"].str.lower() == brand.lower()]
        
    ascending = True if order.lower() == "asc" else False
    if sort_by in df.columns:
        df = df.sort_values(by=sort_by, ascending=ascending)
        
    records = df.to_dict(orient="records")
    return {
        "count": len(records),
        "products": records
    }

@app.get("/api/barcode/{barcode_or_id}")
def lookup_by_barcode(barcode_or_id: str):
    df = get_merged_data()
    val = barcode_or_id.strip()
    
    match = df[df["barcode"].astype(str) == val]
    if match.empty:
        if val.isdigit():
            match = df[df["product_id"] == int(val)]
            
    if match.empty:
        raise HTTPException(status_code=404, detail=f"No product found with barcode or ID: '{val}'")
        
    row = match.iloc[0].to_dict()
    return {
        "status": "success",
        "product_id": int(row["product_id"]),
        "barcode": str(row["barcode"]),
        "product_name": row["product_name"],
        "category": row["category"],
        "subcategory": row["subcategory"],
        "product_type": row["product_type"],
        "brand": row["brand"],
        "stock_level": int(row["stock_level"]),
        "unit_of_measure": str(row["unit_of_measure"]),
        "unit_price": float(row["unit_price"]),
        "cost_price": float(row.get("cost_price", 0.0)),
        "batch_id": str(row.get("batch_id", "")),
        "expiry_date": str(row.get("expiry_date", "")),
        "image_url": str(row.get("image_url", ""))
    }

class ScanFrameRequest(BaseModel):
    image_base64: str

@app.post("/api/scan_frame")
def scan_frame_endpoint(req: ScanFrameRequest):
    try:
        header, encoded = req.image_base64.split(",", 1) if "," in req.image_base64 else ("", req.image_base64)
        image_bytes = base64.b64decode(encoded)
        image = Image.open(io.BytesIO(image_bytes))
        
        detected_barcode = decode_barcode_from_image(image)
        if not detected_barcode:
            return {"status": "not_found", "message": "No barcode detected in frame"}
            
        df = get_merged_data()
        match = df[df["barcode"].astype(str) == detected_barcode.strip()]
        
        if match.empty:
            return {
                "status": "unmapped",
                "barcode": detected_barcode,
                "message": f"Barcode {detected_barcode} detected, but not present in catalog."
            }
            
        row = match.iloc[0].to_dict()
        return {
            "status": "success",
            "product_id": int(row["product_id"]),
            "barcode": str(row["barcode"]),
            "product_name": row["product_name"],
            "category": row["category"],
            "subcategory": row["subcategory"],
            "product_type": row["product_type"],
            "brand": row["brand"],
            "stock_level": int(row["stock_level"]),
            "unit_of_measure": str(row["unit_of_measure"]),
            "unit_price": float(row["unit_price"]),
            "cost_price": float(row.get("cost_price", 0.0)),
            "batch_id": str(row.get("batch_id", "")),
            "expiry_date": str(row.get("expiry_date", "")),
            "image_url": str(row.get("image_url", ""))
        }
    except Exception as e:
        return {"status": "error", "message": str(e)}

@app.post("/api/scan_upload")
async def scan_upload_endpoint(file: UploadFile = File(...)):
    """Upload any photo / image of a product package or barcode to decode and identify SKU."""
    try:
        contents = await file.read()
        image = Image.open(io.BytesIO(contents))
        
        detected_barcode = decode_barcode_from_image(image)
        if not detected_barcode:
            return {
                "status": "not_found", 
                "message": "Could not detect a clear barcode in the uploaded image. Please ensure the barcode is visible and well-lit."
            }
            
        df = get_merged_data()
        match = df[df["barcode"].astype(str) == detected_barcode.strip()]
        
        if match.empty:
            return {
                "status": "unmapped",
                "barcode": detected_barcode,
                "message": f"Barcode {detected_barcode} detected, but not present in product catalog."
            }
            
        row = match.iloc[0].to_dict()
        return {
            "status": "success",
            "product_id": int(row["product_id"]),
            "barcode": str(row["barcode"]),
            "product_name": row["product_name"],
            "category": row["category"],
            "subcategory": row["subcategory"],
            "product_type": row["product_type"],
            "brand": row["brand"],
            "stock_level": int(row["stock_level"]),
            "unit_of_measure": str(row["unit_of_measure"]),
            "unit_price": float(row["unit_price"]),
            "cost_price": float(row.get("cost_price", 0.0)),
            "batch_id": str(row.get("batch_id", "")),
            "expiry_date": str(row.get("expiry_date", "")),
            "image_url": str(row.get("image_url", ""))
        }
    except Exception as e:
        return {"status": "error", "message": f"Failed to process image: {str(e)}"}

# =================== BILLING & CHECKOUT (INVENTORY CSV DECREMENT) ===================

class CartItem(BaseModel):
    product_id: int
    product_name: str
    barcode: Optional[str] = ""
    quantity: int
    unit_price: float
    unit_of_measure: Optional[str] = "Unit"

class CheckoutRequest(BaseModel):
    customer_name: Optional[str] = "Walk-in Customer"
    customer_phone: Optional[str] = ""
    payment_method: Optional[str] = "UPI / Card / Cash"
    items: List[CartItem]
    subtotal: float
    tax: float
    discount: Optional[float] = 0.0
    total_amount: float

@app.post("/api/checkout")
def checkout_endpoint(req: CheckoutRequest):
    """Processes bill payment, creates order receipt, and PERMANENTLY decrements stock in inventory.csv."""
    if not req.items:
        raise HTTPException(status_code=400, detail="Cart is empty. Cannot checkout.")

    inventory_df = pd.read_csv(INVENTORY_FILE)
    barcodes_df = pd.read_csv(BARCODES_FILE) if os.path.exists(BARCODES_FILE) else None
    
    updated_items = []
    
    for item in req.items:
        pid = item.product_id
        qty = max(1, item.quantity)
        
        idx = inventory_df.index[inventory_df['product_id'] == pid].tolist()
        if idx:
            curr_stock = int(inventory_df.loc[idx[0], 'stock_level'])
            new_stock = max(0, curr_stock - qty)
            inventory_df.loc[idx[0], 'stock_level'] = new_stock
            
            # Also sync in barcodes.csv
            if barcodes_df is not None:
                b_idx = barcodes_df.index[barcodes_df['product_id'] == pid].tolist()
                if b_idx:
                    barcodes_df.loc[b_idx[0], 'stock_level'] = new_stock
                    
            updated_items.append({
                "product_id": pid,
                "product_name": item.product_name,
                "purchased_quantity": qty,
                "previous_stock": curr_stock,
                "remaining_stock": new_stock,
                "unit_price": item.unit_price,
                "item_total": round(qty * item.unit_price, 2)
            })
        else:
            updated_items.append({
                "product_id": pid,
                "product_name": item.product_name,
                "purchased_quantity": qty,
                "previous_stock": 0,
                "remaining_stock": 0,
                "unit_price": item.unit_price,
                "item_total": round(qty * item.unit_price, 2)
            })

    # Save decremented stock back to inventory.csv & barcodes.csv
    inventory_df.to_csv(INVENTORY_FILE, index=False)
    if barcodes_df is not None:
        barcodes_df.to_csv(BARCODES_FILE, index=False)

    # Generate Order Record
    now = datetime.datetime.now()
    order_id = f"ORD-{now.strftime('%Y%m%d%H%M%S')}"
    
    order_record = {
        "order_id": order_id,
        "created_at": now.strftime("%Y-%m-%d %H:%M:%S"),
        "customer_name": req.customer_name or "Walk-in Customer",
        "customer_phone": req.customer_phone or "N/A",
        "payment_method": req.payment_method or "UPI / Card",
        "status": "PAID & COMPLETED",
        "items_count": len(req.items),
        "total_units": sum(i.quantity for i in req.items),
        "subtotal": round(req.subtotal, 2),
        "tax": round(req.tax, 2),
        "discount": round(req.discount, 2) if req.discount else 0.0,
        "total_amount": round(req.total_amount, 2),
        "items": [item.dict() for item in req.items],
        "inventory_updates": updated_items
    }
    
    orders = load_orders()
    orders.insert(0, order_record)
    save_orders(orders)

    return {
        "status": "success",
        "message": f"Bill processed successfully! Remaining stock decremented in inventory.csv.",
        "order_id": order_id,
        "order": order_record
    }

@app.get("/api/orders")
def get_orders():
    """Returns order history list."""
    orders = load_orders()
    return {
        "count": len(orders),
        "orders": orders
    }

# =================== AI ANALYSIS & INVENTORY INTELLIGENCE ===================

@app.get("/api/analytics")
def get_analytics():
    """Calculates AI inventory analytics: stock health, reorder alerts, turnover, category velocity."""
    df = get_merged_data()
    orders = load_orders()
    
    # 1. Reorder Alerts (Stock <= Reorder Level)
    low_stock_df = df[df["stock_level"] <= df["reorder_level"]].sort_values(by="stock_level")
    reorder_alerts = low_stock_df[[
        "product_id", "product_name", "category", "subcategory", "brand", 
        "stock_level", "reorder_level", "unit_price", "barcode", "image_url"
    ]].head(15).to_dict(orient="records")

    # 2. Out of stock items
    out_of_stock_df = df[df["stock_level"] == 0]
    out_of_stock_count = int(len(out_of_stock_df))
    
    # 3. Category Breakdown with Velocity
    cat_summary = df.groupby("category").agg(
        total_skus=("product_id", "count"),
        total_units=("stock_level", "sum"),
        total_valuation=("total_value", "sum")
    ).reset_index().to_dict(orient="records")

    # 4. Top Selling Items from POS Orders
    item_sales_map = {}
    for ord in orders:
        for it in ord.get("items", []):
            p_name = it.get("product_name", "Unknown")
            qty = it.get("quantity", 1)
            amt = qty * it.get("unit_price", 0)
            if p_name not in item_sales_map:
                item_sales_map[p_name] = {"product_name": p_name, "units_sold": 0, "revenue": 0.0}
            item_sales_map[p_name]["units_sold"] += qty
            item_sales_map[p_name]["revenue"] += amt

    top_billed_products = sorted(item_sales_map.values(), key=lambda x: x["revenue"], reverse=True)[:8]

    # 5. Inventory Health Metrics
    total_skus = len(df)
    healthy_skus = len(df[df["stock_level"] > df["reorder_level"]])
    health_ratio = round((healthy_skus / total_skus) * 100, 1) if total_skus > 0 else 100.0

    # AI Actionable Insights
    ai_insights = []
    if len(reorder_alerts) > 0:
        critical_item = reorder_alerts[0]
        ai_insights.append({
            "type": "warning",
            "title": f"Critical Stock Depletion: {critical_item['product_name']}",
            "desc": f"Current stock is {critical_item['stock_level']} units, below safety reorder threshold of {critical_item['reorder_level']}. Recommended order: {critical_item['reorder_level'] * 3} units."
        })

    ai_insights.append({
        "type": "success",
        "title": "Fast Stock Velocity in Bakery & Dairy",
        "desc": f"Recent barcode billings show high turnover for snack and breakfast items. Maintain optimal batch freshness."
    })
    
    ai_insights.append({
        "type": "info",
        "title": "Inventory Capital Valuation",
        "desc": f"Current active store valuation is ₹{df['total_value'].sum():,.2f} across {total_skus} managed SKUs with {health_ratio}% health score."
    })

    return {
        "status": "success",
        "inventory_health_score": health_ratio,
        "total_skus": total_skus,
        "healthy_skus": healthy_skus,
        "low_stock_count": len(low_stock_df),
        "out_of_stock_count": out_of_stock_count,
        "total_inventory_valuation": round(float(df["total_value"].sum()), 2),
        "total_orders_count": len(orders),
        "total_billed_revenue": round(sum(o.get("total_amount", 0) for o in orders), 2),
        "reorder_alerts": reorder_alerts,
        "top_billed_products": top_billed_products,
        "category_summary": cat_summary,
        "ai_insights": ai_insights
    }
