import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Search, 
  Clock, 
  RefreshCw, 
  Package, 
  ChevronRight,
  Camera,
  Upload,
  X,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  ScanLine,
  Image as ImageIcon,
  Receipt,
  ShoppingCart,
  ShoppingBag,
  TrendingUp,
  Boxes,
  CreditCard,
  Plus,
  Minus,
  Trash2,
  Printer,
  Sparkles,
  ArrowRight,
  Layers,
  AlertTriangle,
  BadgeCheck,
  Zap
} from 'lucide-react';

export default function App() {
  // Navigation: 'billing' | 'orders' | 'inventory' | 'analytics'
  const [activeTab, setActiveTab] = useState('billing');

  const [stats, setStats] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Store / Inventory Navigation State
  const [selectedCategory, setSelectedCategory] = useState('Groceries');
  const [selectedSubcategory, setSelectedSubcategory] = useState('Dairy');
  const [selectedProductType, setSelectedProductType] = useState(null);
  const [selectedBrand, setSelectedBrand] = useState(null);

  // Billing / Cart State
  const [billItems, setBillItems] = useState([]);
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('UPI / GPay');
  const [manualBarcodeInput, setManualBarcodeInput] = useState('');
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const [lastCompletedOrder, setLastCompletedOrder] = useState(null);
  const [receiptModalOpen, setReceiptModalOpen] = useState(false);
  const [viewingOrder, setViewingOrder] = useState(null);

  // Scanner State
  const [scannerMode, setScannerMode] = useState('upload'); // 'upload' | 'camera'
  const [scanStatusMsg, setScanStatusMsg] = useState('');
  const [scanErrorMsg, setScanErrorMsg] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [scannedPreview, setScannedPreview] = useState(null);

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const scanIntervalRef = useRef(null);
  const fileInputRef = useRef(null);

  // Fetch all initial data
  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, prodRes, ordRes, anaRes] = await Promise.all([
        fetch('/api/stats'),
        fetch('/api/products'),
        fetch('/api/orders'),
        fetch('/api/analytics')
      ]);
      const statsJson = await statsRes.json();
      const prodJson = await prodRes.json();
      const ordJson = await ordRes.json();
      const anaJson = await anaRes.json();

      setStats(statsJson);
      setProducts(prodJson.products || []);
      setOrders(ordJson.orders || []);
      setAnalytics(anaJson);
    } catch (err) {
      console.error('Error fetching inventory data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Compute Subcategories dynamically based on Category
  const subcategoriesList = useMemo(() => {
    const list = new Set();
    products.forEach(p => {
      if (p.category === selectedCategory) {
        list.add(p.subcategory);
      }
    });
    return Array.from(list);
  }, [products, selectedCategory]);

  // Ensure valid subcategory when category changes
  useEffect(() => {
    if (subcategoriesList.length > 0 && !subcategoriesList.includes(selectedSubcategory)) {
      setSelectedSubcategory(subcategoriesList[0]);
      setSelectedProductType(null);
      setSelectedBrand(null);
    }
  }, [subcategoriesList, selectedSubcategory]);

  // Compute Product Types dynamically based on Subcategory
  const productTypesList = useMemo(() => {
    const list = new Set();
    products.forEach(p => {
      if (p.category === selectedCategory && p.subcategory === selectedSubcategory && p.product_type) {
        list.add(p.product_type);
      }
    });
    return Array.from(list);
  }, [products, selectedCategory, selectedSubcategory]);

  // Compute Brands dynamically based on Subcategory & Product Type
  const brandsList = useMemo(() => {
    const list = new Set();
    products.forEach(p => {
      const matchesCat = p.category === selectedCategory;
      const matchesSub = p.subcategory === selectedSubcategory;
      const matchesType = !selectedProductType || p.product_type === selectedProductType;
      if (matchesCat && matchesSub && matchesType && p.brand) {
        list.add(p.brand);
      }
    });
    return Array.from(list);
  }, [products, selectedCategory, selectedSubcategory, selectedProductType]);

  // Group products by Product Type for the Inventory view
  const groupedByType = useMemo(() => {
    const map = {};

    products.forEach(p => {
      const matchesCat = p.category === selectedCategory;
      const matchesSub = p.subcategory === selectedSubcategory;
      const matchesType = !selectedProductType || p.product_type === selectedProductType;
      const matchesBrand = !selectedBrand || p.brand === selectedBrand;
      const matchesSearch = !searchQuery.trim() || 
        p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.product_type.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (p.barcode && p.barcode.includes(searchQuery.trim()));

      if (matchesCat && matchesSub && matchesType && matchesBrand && matchesSearch) {
        const typeKey = p.product_type || 'General Items';
        if (!map[typeKey]) {
          map[typeKey] = [];
        }
        map[typeKey].push(p);
      }
    });

    return Object.entries(map).map(([typeName, items]) => {
      const totalUnits = items.reduce((sum, item) => sum + item.stock_level, 0);
      const uniqueBrandsCount = new Set(items.map(i => i.brand)).size;
      return {
        typeName,
        totalUnits,
        uniqueBrandsCount,
        items
      };
    });
  }, [products, selectedCategory, selectedSubcategory, selectedProductType, selectedBrand, searchQuery]);

  // Add Product to Active Bill
  const addProductToBill = (product) => {
    setBillItems(prev => {
      const existing = prev.find(item => item.product_id === product.product_id);
      if (existing) {
        return prev.map(item => 
          item.product_id === product.product_id 
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      } else {
        return [
          ...prev,
          {
            product_id: product.product_id,
            product_name: product.product_name,
            barcode: product.barcode || '',
            unit_price: Number(product.unit_price) || 0,
            quantity: 1,
            unit_of_measure: product.unit_of_measure || 'Unit',
            image_url: product.image_url || '',
            stock_level: product.stock_level || 0
          }
        ];
      }
    });

    setScanStatusMsg(`✅ Added "${product.product_name}" (₹${product.unit_price}) to Bill!`);
    setTimeout(() => {
      setScanStatusMsg('');
    }, 4000);
  };

  // Modify Cart Item Quantity
  const updateQuantity = (productId, delta) => {
    setBillItems(prev => {
      return prev.map(item => {
        if (item.product_id === productId) {
          const newQty = item.quantity + delta;
          return newQty > 0 ? { ...item, quantity: newQty } : null;
        }
        return item;
      }).filter(Boolean);
    });
  };

  // Remove Item from Bill
  const removeBillItem = (productId) => {
    setBillItems(prev => prev.filter(item => item.product_id !== productId));
  };

  // Bill Calculations
  const billSubtotal = useMemo(() => {
    return billItems.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
  }, [billItems]);

  const billTax = useMemo(() => {
    return Math.round(billSubtotal * 0.05 * 100) / 100; // 5% GST
  }, [billSubtotal]);

  const billGrandTotal = useMemo(() => {
    return Math.round((billSubtotal + billTax) * 100) / 100;
  }, [billSubtotal, billTax]);

  // Barcode Lookup Handler (Manual or Scanned)
  const lookupAndAddBarcode = async (barcodeVal) => {
    const code = barcodeVal.trim();
    if (!code) return;

    setScanErrorMsg('');
    try {
      const res = await fetch(`/api/barcode/${encodeURIComponent(code)}`);
      const data = await res.json();

      if (res.ok && data.status === 'success') {
        addProductToBill(data);
        setManualBarcodeInput('');
      } else {
        setScanErrorMsg(data.detail || `Barcode "${code}" not found in catalog.`);
      }
    } catch (err) {
      console.error('Barcode lookup error:', err);
      setScanErrorMsg(`Failed to lookup barcode "${code}".`);
    }
  };

  // File Upload Barcode Scan Handler
  const handleFileUpload = async (file) => {
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    setScannedPreview(previewUrl);
    setScanErrorMsg('');
    setIsScanning(true);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/scan_upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.status === 'success') {
        addProductToBill(data);
      } else if (data.status === 'unmapped') {
        setScanErrorMsg(`Detected Barcode: ${data.barcode}, but it is not linked to any SKU in the catalog.`);
      } else {
        setScanErrorMsg(data.message || 'Could not detect barcode from uploaded image. Please ensure good lighting.');
      }
    } catch (err) {
      console.error('Upload scan error:', err);
      setScanErrorMsg('Error analyzing packaging image. Please try again.');
    } finally {
      setIsScanning(false);
    }
  };

  // Drag and drop for image scanner
  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // Live Camera Frame Capture & Scan
  const captureAndScanCameraFrame = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    if (video.readyState !== 4 || video.videoWidth === 0) return;

    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64Image = canvas.toDataURL('image/jpeg', 0.85);

    try {
      const res = await fetch('/api/scan_frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_base64: base64Image })
      });
      const data = await res.json();

      if (data.status === 'success') {
        addProductToBill(data);
        stopCamera();
        setScannerMode('upload');
      } else if (data.status === 'unmapped') {
        setScanErrorMsg(`Detected Barcode: ${data.barcode} (Unmapped SKU)`);
      }
    } catch (err) {
      console.error('Camera frame scan error:', err);
    }
  };

  const startCamera = async () => {
    setScanErrorMsg('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { 
          facingMode: 'environment', 
          width: { ideal: 1280 }, 
          height: { ideal: 720 } 
        }
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      if (scanIntervalRef.current) clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = setInterval(() => {
        captureAndScanCameraFrame();
      }, 400);

    } catch (err) {
      console.error("Camera access error:", err);
      setScanErrorMsg("Camera access denied or unavailable.");
    }
  };

  const stopCamera = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    if (activeTab === 'billing' && scannerMode === 'camera') {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [activeTab, scannerMode]);

  // PROCEED TO PAY (Checkout & Persistent Inventory CSV Deduction)
  const handleProceedToPay = async () => {
    if (billItems.length === 0) {
      setScanErrorMsg("Bill is empty! Please scan or add products first.");
      return;
    }

    setIsCheckingOut(true);
    setScanErrorMsg('');

    const payload = {
      customer_name: customerName || 'Walk-in Customer',
      customer_phone: customerPhone || 'N/A',
      payment_method: paymentMethod,
      items: billItems.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        barcode: item.barcode || '',
        quantity: item.quantity,
        unit_price: item.unit_price,
        unit_of_measure: item.unit_of_measure
      })),
      subtotal: billSubtotal,
      tax: billTax,
      discount: 0.0,
      total_amount: billGrandTotal
    };

    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok && data.status === 'success') {
        setLastCompletedOrder(data.order);
        setReceiptModalOpen(true);
        setBillItems([]); // Clear bill
        fetchData(); // Refresh stock in CSVs & Analytics
      } else {
        setScanErrorMsg(data.detail || data.message || 'Payment failed.');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setScanErrorMsg('Checkout error occurred. Check backend service.');
    } finally {
      setIsCheckingOut(false);
    }
  };

  const getSubcategoryEmoji = (sub) => {
    switch (sub?.toLowerCase()) {
      case 'hair': return '🧴 ';
      case 'dairy': return '🥛 ';
      case 'staples': return '🌾 ';
      case 'snacks': return '🍿 ';
      case 'beverages': return '🧃 ';
      case 'spices': return '🌶️ ';
      case 'bakery': return '🍞 ';
      case 'cleaning': return '🧹 ';
      case 'laundry': return '🫧 ';
      case 'bath': return '🧼 ';
      case 'skin': return '✨ ';
      case 'oral': return '🪥 ';
      case 'grooming': return '🪒 ';
      case 'kitchen': return '🍽️ ';
      case 'home care': return '🏠 ';
      case 'stationery': return '📎 ';
      default: return '📦 ';
    }
  };

  const getTypeEmoji = (ptype) => {
    const p = (ptype || '').toLowerCase();
    if (p.includes('ice cream')) return '🍨';
    if (p.includes('shampoo')) return '🧴';
    if (p.includes('oil')) return '🫒';
    if (p.includes('conditioner') || p.includes('serum')) return '✨';
    if (p.includes('flavoured') || p.includes('kool')) return '🧃';
    if (p.includes('milk')) return '🥛';
    if (p.includes('cake') || p.includes('bread') || p.includes('bakery')) return '🍞';
    if (p.includes('ghee') || p.includes('butter')) return '🧈';
    if (p.includes('paneer') || p.includes('cheese')) return '🧀';
    if (p.includes('atta') || p.includes('flour') || p.includes('rice')) return '🌾';
    if (p.includes('tea') || p.includes('coffee')) return '☕';
    if (p.includes('soap')) return '🧼';
    if (p.includes('biscuit') || p.includes('snack')) return '🍪';
    return '📦';
  };

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* 1. Header Bar with Brand & 4 Primary Navigation Tabs */}
      <header className="instamart-top-bar">
        <div className="top-bar-inner">
          <div className="brand-wrapper">
            <div>
              <h1 className="logo-text">instamart</h1>
              <p className="logo-tagline">POS & INVENTORY INTELLIGENCE</p>
            </div>
            <div className="time-delivery-badge">
              <Clock size={14} />
              <span>LIVE STORE</span>
            </div>
          </div>

          {/* 4 Navigation Tabs */}
          <nav className="main-nav-tabs">
            <button 
              className={`nav-tab-item ${activeTab === 'billing' ? 'active' : ''}`}
              onClick={() => setActiveTab('billing')}
            >
              <Receipt size={17} />
              <span>Start Billing</span>
              {billItems.length > 0 && (
                <span className="nav-cart-badge">{billItems.length}</span>
              )}
            </button>

            <button 
              className={`nav-tab-item ${activeTab === 'orders' ? 'active' : ''}`}
              onClick={() => setActiveTab('orders')}
            >
              <ShoppingBag size={17} />
              <span>Orders</span>
              {orders.length > 0 && (
                <span className="nav-pill-count">{orders.length}</span>
              )}
            </button>

            <button 
              className={`nav-tab-item ${activeTab === 'inventory' ? 'active' : ''}`}
              onClick={() => setActiveTab('inventory')}
            >
              <Boxes size={17} />
              <span>Inventory</span>
              {stats && <span className="nav-pill-count">{stats.total_skus}</span>}
            </button>

            <button 
              className={`nav-tab-item ${activeTab === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveTab('analytics')}
            >
              <Sparkles size={17} />
              <span>AI Analysis</span>
            </button>
          </nav>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            <button 
              onClick={fetchData}
              className="btn-sync-csv"
              title="Reload data from products.csv, inventory.csv & barcodes.csv"
            >
              <RefreshCw size={14} className={loading ? 'spinner' : ''} />
              <span>Sync CSV</span>
            </button>
          </div>
        </div>
      </header>

      {/* 2. TAB 1: START BILLING (Barcode Scanner + Active POS Terminal) */}
      {activeTab === 'billing' && (
        <div className="pos-billing-layout">
          {/* Left Column: Barcode Scanner & Quick Add Section */}
          <div className="pos-scanner-column">
            <div className="pos-card">
              <div className="pos-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ScanLine size={20} color="var(--brand-burgundy)" />
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>Scan Product Barcode</h3>
                </div>
                <div className="scanner-mode-switch-small">
                  <button 
                    className={`mode-btn-sm ${scannerMode === 'upload' ? 'active' : ''}`}
                    onClick={() => { setScannerMode('upload'); stopCamera(); }}
                  >
                    <Upload size={14} /> Upload Image
                  </button>
                  <button 
                    className={`mode-btn-sm ${scannerMode === 'camera' ? 'active' : ''}`}
                    onClick={() => setScannerMode('camera')}
                  >
                    <Camera size={14} /> Camera
                  </button>
                </div>
              </div>

              {/* Status Toast */}
              {scanStatusMsg && (
                <div className="pos-status-toast">
                  <BadgeCheck size={18} />
                  <span>{scanStatusMsg}</span>
                </div>
              )}

              {/* Error Alert */}
              {scanErrorMsg && (
                <div className="pos-error-alert">
                  <AlertCircle size={18} />
                  <span>{scanErrorMsg}</span>
                </div>
              )}

              {/* Mode A: Upload Image File (Drag & Drop or Click) */}
              {scannerMode === 'upload' && (
                <>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    style={{ display: 'none' }} 
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileUpload(e.target.files[0]);
                      }
                    }}
                  />

                  <div 
                    className="billing-upload-dropzone"
                    onClick={() => fileInputRef.current && fileInputRef.current.click()}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                  >
                    {isScanning ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                        <RefreshCw className="spinner" size={32} color="var(--brand-burgundy)" />
                        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>Analyzing packaging barcode...</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Auto-detecting EAN-13 barcode & stock</span>
                      </div>
                    ) : scannedPreview ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
                        <img src={scannedPreview} alt="Scanned packaging" className="billing-preview-img" />
                        <span style={{ fontSize: '0.8rem', color: 'var(--brand-burgundy)', fontWeight: 700 }}>
                          📸 Image Analyzed • Click or drop another image to add more items
                        </span>
                      </div>
                    ) : (
                      <>
                        <div className="billing-upload-icon">
                          <ImageIcon size={26} />
                        </div>
                        <p style={{ fontWeight: 700, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                          Drop packaging photo (Amul, Hocco, Britannia, etc.)
                        </p>
                        <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                          Click to browse or drop product photo to add to bill automatically
                        </p>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* Mode B: Live Camera Video Stream */}
              {scannerMode === 'camera' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <div className="billing-camera-wrapper">
                    <video ref={videoRef} playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div className="laser-scan-line"></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-sub)' }}>
                      Aim barcode at center line. Instant detection active.
                    </span>
                    <button 
                      onClick={captureAndScanCameraFrame}
                      className="btn-camera-snap"
                    >
                      <ScanLine size={15} /> Snapshot Scan
                    </button>
                  </div>
                </div>
              )}

              {/* Manual Barcode Input Row */}
              <div style={{ marginTop: '14px', paddingTop: '14px', borderTop: '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: '6px' }}>
                  OR ENTER BARCODE / PRODUCT ID MANUALLY
                </span>
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    lookupAndAddBarcode(manualBarcodeInput);
                  }}
                  style={{ display: 'flex', gap: '8px' }}
                >
                  <input 
                    type="text" 
                    placeholder="e.g. 8901262153362 or 8906172542497"
                    className="billing-barcode-input"
                    value={manualBarcodeInput}
                    onChange={(e) => setManualBarcodeInput(e.target.value)}
                  />
                  <button type="submit" className="btn-add-barcode">
                    + Add to Bill
                  </button>
                </form>
              </div>
            </div>

            {/* Quick Add Recent / Frequently Scanned Catalog Items */}
            <div className="pos-card" style={{ marginTop: '16px' }}>
              <h4 style={{ fontSize: '0.88rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '10px' }}>
                ⭐ Quick Add Verified Products
              </h4>
              <div className="quick-add-grid">
                {products.filter(p => [95, 201, 202, 203, 1, 21].includes(p.product_id)).map(p => (
                  <button 
                    key={p.product_id}
                    className="quick-item-btn"
                    onClick={() => addProductToBill(p)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '1.2rem' }}>{getTypeEmoji(p.product_type)}</span>
                      <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.2 }}>
                          {p.product_name}
                        </div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-sub)' }}>
                          ₹{p.unit_price} • {p.stock_level} in stock
                        </div>
                      </div>
                    </div>
                    <Plus size={16} color="var(--brand-burgundy)" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Active Bill Terminal & "Proceed to Pay" */}
          <div className="pos-terminal-column">
            <div className="pos-card pos-bill-terminal">
              <div className="terminal-header">
                <div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--brand-burgundy)' }}>
                    Current Active Bill
                  </h3>
                  <p style={{ fontSize: '0.78rem', color: 'var(--text-sub)' }}>
                    Items scanned: {billItems.reduce((s, i) => s + i.quantity, 0)} Units
                  </p>
                </div>
                {billItems.length > 0 && (
                  <button 
                    onClick={() => setBillItems([])}
                    className="btn-clear-bill"
                    title="Clear bill"
                  >
                    <Trash2 size={15} /> Clear
                  </button>
                )}
              </div>

              {/* Customer Info Form */}
              <div className="customer-info-row">
                <div style={{ flex: 1 }}>
                  <label className="customer-label">Customer Name</label>
                  <input 
                    type="text" 
                    className="customer-input"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Customer Name"
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="customer-label">Phone Number</label>
                  <input 
                    type="text" 
                    className="customer-input"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="e.g. 9876543210"
                  />
                </div>
              </div>

              {/* Bill Items Table */}
              <div className="bill-table-container">
                {billItems.length === 0 ? (
                  <div className="empty-bill-state">
                    <ShoppingCart size={40} color="#CBD5E1" />
                    <p style={{ fontWeight: 700, color: 'var(--text-main)', marginTop: '8px' }}>
                      No items scanned in bill
                    </p>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      Upload a product image or scan a barcode from the left to add items.
                    </p>
                  </div>
                ) : (
                  <table className="bill-table">
                    <thead>
                      <tr>
                        <th>Item Details</th>
                        <th style={{ textAlign: 'center' }}>Price</th>
                        <th style={{ textAlign: 'center' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th style={{ textAlign: 'center' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {billItems.map(item => (
                        <tr key={item.product_id}>
                          <td>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--text-main)' }}>
                              {item.product_name}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                              ID #{item.product_id} {item.barcode && `• Barcode: ${item.barcode}`}
                            </div>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.88rem' }}>
                            ₹{item.unit_price.toFixed(0)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <div className="qty-controls">
                              <button 
                                onClick={() => updateQuantity(item.product_id, -1)}
                                className="qty-btn"
                              >
                                <Minus size={12} />
                              </button>
                              <span style={{ fontWeight: 800, fontSize: '0.9rem', minWidth: '18px', textAlign: 'center' }}>
                                {item.quantity}
                              </span>
                              <button 
                                onClick={() => updateQuantity(item.product_id, 1)}
                                className="qty-btn"
                              >
                                <Plus size={12} />
                              </button>
                            </div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-main)' }}>
                            ₹{(item.quantity * item.unit_price).toFixed(2)}
                          </td>
                          <td style={{ textAlign: 'center' }}>
                            <button 
                              onClick={() => removeBillItem(item.product_id)}
                              className="btn-delete-item"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Bill Payment & Totals Summary */}
              <div className="bill-summary-card">
                <div className="summary-line">
                  <span>Subtotal</span>
                  <span>₹{billSubtotal.toFixed(2)}</span>
                </div>
                <div className="summary-line">
                  <span>GST (5%)</span>
                  <span>₹{billTax.toFixed(2)}</span>
                </div>
                <div className="summary-line grand-total">
                  <span>Grand Total</span>
                  <span style={{ color: 'var(--brand-burgundy)' }}>₹{billGrandTotal.toFixed(2)}</span>
                </div>

                {/* Payment Mode Selector */}
                <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                  {['UPI / GPay', 'Card', 'Cash'].map(mode => (
                    <button
                      key={mode}
                      className={`payment-mode-pill ${paymentMethod === mode ? 'active' : ''}`}
                      onClick={() => setPaymentMethod(mode)}
                    >
                      {mode}
                    </button>
                  ))}
                </div>

                {/* PROCEED TO PAY BUTTON */}
                <button 
                  onClick={handleProceedToPay}
                  disabled={billItems.length === 0 || isCheckingOut}
                  className="btn-proceed-pay"
                >
                  {isCheckingOut ? (
                    <>
                      <RefreshCw className="spinner" size={18} />
                      <span>Processing & Updating CSV...</span>
                    </>
                  ) : (
                    <>
                      <CreditCard size={18} />
                      <span>Proceed to Pay (₹{billGrandTotal.toFixed(2)})</span>
                      <ArrowRight size={18} />
                    </>
                  )}
                </button>
                <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '6px' }}>
                  ⚡ Stock remaining will be decremented in Data/inventory.csv immediately upon payment.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. TAB 2: ORDERS (Order History & Receipts) */}
      {activeTab === 'orders' && (
        <div className="instamart-app" style={{ marginTop: '24px' }}>
          <div className="orders-header-card">
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-burgundy)' }}>
                Completed Orders & Invoices
              </h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>
                Total {orders.length} orders recorded. Stock deductions synced in inventory.csv.
              </p>
            </div>
            <button 
              onClick={() => setActiveTab('billing')}
              className="btn-new-bill"
            >
              <Plus size={16} /> Start New Bill
            </button>
          </div>

          {orders.length === 0 ? (
            <div className="empty-orders-card">
              <Receipt size={48} color="#CBD5E1" />
              <h3 style={{ marginTop: '12px' }}>No orders placed yet</h3>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                Scan product barcodes in "Start Billing" and click Proceed to Pay to generate your first order.
              </p>
            </div>
          ) : (
            <div className="orders-grid">
              {orders.map(order => (
                <div key={order.order_id} className="order-history-card">
                  <div className="order-card-top">
                    <div>
                      <div className="order-id-badge">{order.order_id}</div>
                      <span className="order-time">{order.created_at}</span>
                    </div>
                    <span className="order-status-tag">{order.status}</span>
                  </div>

                  <div className="order-card-customer">
                    👤 <strong>{order.customer_name}</strong> {order.customer_phone && `(${order.customer_phone})`}
                  </div>

                  <div className="order-items-preview">
                    {order.items && order.items.map((it, idx) => (
                      <div key={idx} className="order-preview-line">
                        <span>{it.quantity}x {it.product_name}</span>
                        <span>₹{(it.quantity * it.unit_price).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  <div className="order-card-footer">
                    <div>
                      <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>Paid via {order.payment_method}</span>
                      <strong style={{ fontSize: '1.15rem', color: 'var(--text-main)' }}>₹{order.total_amount.toFixed(2)}</strong>
                    </div>
                    <button 
                      onClick={() => setViewingOrder(order)}
                      className="btn-view-invoice"
                    >
                      <Receipt size={14} /> View Receipt
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. TAB 3: INVENTORY (Instamart Visual Catalog with Remaining Stock) */}
      {activeTab === 'inventory' && (
        <div>
          {/* 3 Main Categories Bar */}
          <nav className="category-pills-bar">
            <div className="category-pills-container">
              {stats && stats.category_breakdown.map((cat) => (
                <button
                  key={cat.category}
                  className={`cat-pill-btn ${selectedCategory === cat.category ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedCategory(cat.category);
                    setSelectedProductType(null);
                    setSelectedBrand(null);
                  }}
                >
                  <span>{cat.category}</span>
                  <span className="cat-count-badge">{cat.items}</span>
                </button>
              ))}
            </div>
          </nav>

          <div className="instamart-app">
            <div className="main-store-layout">
              {/* Left Sidebar Subcategories */}
              <aside className="subcategories-sidebar">
                <div className="sidebar-title">{selectedCategory} Subcategories</div>

                {subcategoriesList.map((sub) => (
                  <button
                    key={sub}
                    className={`subcat-sidebar-item ${selectedSubcategory === sub ? 'active' : ''}`}
                    onClick={() => {
                      setSelectedSubcategory(sub);
                      setSelectedProductType(null);
                      setSelectedBrand(null);
                    }}
                  >
                    <span>{getSubcategoryEmoji(sub)}{sub}</span>
                    <ChevronRight size={14} color="#94A3B8" />
                  </button>
                ))}
              </aside>

              {/* Right Store Content */}
              <main className="store-content-area">
                {/* Search & Filter Controls */}
                <section className="filter-controls-card">
                  <div style={{ position: 'relative', marginBottom: '4px' }}>
                    <Search className="search-header-icon" size={16} />
                    <input 
                      type="text" 
                      placeholder="Search inventory items, barcodes, or brands..."
                      className="search-header-input"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>

                  {productTypesList.length > 0 && (
                    <div className="filter-section-row">
                      <span className="filter-section-title">
                        {selectedSubcategory} Categories ({productTypesList.length})
                      </span>
                      <div className="chips-scroll-row">
                        {productTypesList.map((ptype) => (
                          <button
                            key={ptype}
                            className={`chip-btn ${selectedProductType === ptype ? 'active' : ''}`}
                            onClick={() => {
                              setSelectedProductType(selectedProductType === ptype ? null : ptype);
                              setSelectedBrand(null);
                            }}
                          >
                            {getTypeEmoji(ptype)} {ptype}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {brandsList.length > 0 && (
                    <div className="filter-section-row">
                      <span className="filter-section-title">
                        Brands ({brandsList.length})
                      </span>
                      <div className="chips-scroll-row">
                        {brandsList.map((b) => (
                          <button
                            key={b}
                            className={`chip-btn ${selectedBrand === b ? 'active' : ''}`}
                            onClick={() => setSelectedBrand(selectedBrand === b ? null : b)}
                          >
                            🏷️ {b}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </section>

                {/* Products Grid by Type */}
                {loading ? (
                  <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-sub)' }}>
                    <RefreshCw className="spinner" size={32} style={{ margin: '0 auto 12px auto' }} />
                    <p>Loading Instamart catalog & live stock...</p>
                  </div>
                ) : groupedByType.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '60px 20px', background: '#FFFFFF', borderRadius: '16px' }}>
                    <Package size={48} color="#CBD5E1" style={{ margin: '0 auto 12px auto' }} />
                    <h3>No products found</h3>
                    <p style={{ color: 'var(--text-sub)', fontSize: '0.9rem', marginTop: '4px' }}>
                      Try selecting another subcategory or clear search.
                    </p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    {groupedByType.map((group) => (
                      <section key={group.typeName} className="ptype-group-section">
                        <div className="ptype-group-header">
                          <div className="ptype-header-title">
                            <span>{getTypeEmoji(group.typeName)}</span>
                            <span>{group.typeName}</span>
                            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                              ({group.uniqueBrandsCount} Brands • {group.items.length} Items)
                            </span>
                          </div>
                          <div className="ptype-header-stats">
                            Remaining Stock: {group.totalUnits.toLocaleString()} Units
                          </div>
                        </div>

                        <div className="products-grid">
                          {group.items.map((p) => (
                            <div key={p.product_id} className="clean-product-card">
                              <div className="card-brand-badge">
                                🏷️ {p.brand}
                              </div>

                              <div className={`stock-tag-pill ${p.stock_level <= 10 ? 'low' : ''}`}>
                                {p.stock_level} in stock
                              </div>

                              <div className="card-image-wrapper">
                                {p.image_url ? (
                                  <img 
                                    src={p.image_url} 
                                    alt={p.product_name}
                                    className="product-real-img"
                                    onError={(e) => {
                                      e.target.style.display = 'none';
                                      e.target.nextSibling.style.display = 'flex';
                                    }}
                                  />
                                ) : null}
                                <div 
                                  className="product-img-fallback" 
                                  style={{ display: p.image_url ? 'none' : 'flex' }}
                                >
                                  {getTypeEmoji(group.typeName)}
                                </div>
                              </div>

                              <div className="card-info">
                                <h3 className="card-product-name" title={p.product_name}>
                                  {p.product_name}
                                </h3>
                                <span className="card-pack-unit">
                                  Package: {p.unit_of_measure}
                                </span>
                                {p.barcode && (
                                  <span className="card-barcode-code">
                                    📊 {p.barcode}
                                  </span>
                                )}
                              </div>

                              <div className="card-details-footer">
                                <div className="price-display-block">
                                  <span className="price-label">Price</span>
                                  <span className="price-val">₹{p.unit_price.toFixed(0)}</span>
                                </div>

                                <div className="units-display-block">
                                  <span className="units-label">Available</span>
                                  <span className="units-val" style={{ color: p.stock_level <= 10 ? '#DC2626' : 'var(--brand-green)' }}>
                                    {p.stock_level} {p.unit_of_measure}
                                  </span>
                                </div>
                              </div>

                              <button 
                                onClick={() => {
                                  addProductToBill(p);
                                  setActiveTab('billing');
                                }}
                                className="btn-card-bill-add"
                              >
                                <Plus size={14} /> Add to Bill
                              </button>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </main>
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB 4: AI ANALYSIS (Inventory Intelligence & Health) */}
      {activeTab === 'analytics' && (
        <div className="instamart-app" style={{ marginTop: '24px' }}>
          {/* Key Metrics Row */}
          <div className="analytics-metrics-grid">
            <div className="analytics-stat-card">
              <div className="stat-card-top">
                <span className="stat-title">Inventory Health Score</span>
                <span className="stat-icon-circle green">
                  <BadgeCheck size={20} />
                </span>
              </div>
              <div className="stat-main-num" style={{ color: 'var(--brand-green)' }}>
                {analytics ? `${analytics.inventory_health_score}%` : '89.2%'}
              </div>
              <p className="stat-subtitle">Ratio of healthy SKUs above safety reorder thresholds</p>
            </div>

            <div className="analytics-stat-card">
              <div className="stat-card-top">
                <span className="stat-title">Store Capital Valuation</span>
                <span className="stat-icon-circle burgundy">
                  <CreditCard size={20} />
                </span>
              </div>
              <div className="stat-main-num">
                {analytics ? `₹${(analytics.total_inventory_valuation / 100000).toFixed(2)}L` : '₹69.33L'}
              </div>
              <p className="stat-subtitle">Total active inventory stock worth</p>
            </div>

            <div className="analytics-stat-card">
              <div className="stat-card-top">
                <span className="stat-title">POS Billed Revenue</span>
                <span className="stat-icon-circle orange">
                  <TrendingUp size={20} />
                </span>
              </div>
              <div className="stat-main-num" style={{ color: 'var(--brand-orange)' }}>
                {analytics ? `₹${analytics.total_billed_revenue.toFixed(2)}` : '₹0.00'}
              </div>
              <p className="stat-subtitle">From {analytics?.total_orders_count || 0} completed orders</p>
            </div>

            <div className="analytics-stat-card">
              <div className="stat-card-top">
                <span className="stat-title">Reorder Alerts</span>
                <span className="stat-icon-circle red">
                  <AlertTriangle size={20} />
                </span>
              </div>
              <div className="stat-main-num" style={{ color: '#DC2626' }}>
                {analytics ? analytics.low_stock_count : 0} SKUs
              </div>
              <p className="stat-subtitle">Items below safety reorder level</p>
            </div>
          </div>

          {/* AI Strategic Insights */}
          <div className="ai-insights-section">
            <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--brand-burgundy)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Sparkles size={20} /> AI Inventory Intelligence & Actionable Insights
            </h3>

            <div className="ai-insights-list">
              {analytics && analytics.ai_insights ? analytics.ai_insights.map((ins, i) => (
                <div key={i} className={`ai-insight-card ${ins.type}`}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                    <div className="insight-bullet-icon">
                      {ins.type === 'warning' ? <AlertTriangle size={18} /> : <Zap size={18} />}
                    </div>
                    <div>
                      <h4 style={{ fontSize: '0.95rem', fontWeight: 800, marginBottom: '2px' }}>{ins.title}</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', lineHeight: 1.4 }}>{ins.desc}</p>
                    </div>
                  </div>
                </div>
              )) : (
                <p>Loading insights...</p>
              )}
            </div>
          </div>

          {/* Item-level demand forecast */}
          <div className="forecast-card">
            <div className="forecast-card-header">
              <div>
                <h3><TrendingUp size={20} /> 30-Day Demand Forecast</h3>
                <p>
                  Based on the latest 8 weeks of POS sales
                  {analytics?.demand_forecast?.forecast_start_date && ` · forecast begins ${analytics.demand_forecast.forecast_start_date}`}
                </p>
              </div>
              <span className="forecast-method-badge">Weekday-aware model</span>
            </div>
            <div className="forecast-table-wrap">
              <table className="forecast-table">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>Daily Demand</th>
                    <th>Next 30 Days</th>
                    <th>Stock Cover</th>
                    <th>Estimated Stock-out</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics?.demand_forecast?.items?.length ? analytics.demand_forecast.items.map(item => (
                    <tr key={item.product_id}>
                      <td>
                        <strong>{item.product_name}</strong>
                        <span>{item.category} · {item.stock_level} units available</span>
                      </td>
                      <td>{item.avg_daily_demand} units/day</td>
                      <td><strong>{item.forecast_30_days} units</strong></td>
                      <td className={item.days_of_cover <= 30 ? 'forecast-risk' : ''}>
                        {item.days_of_cover} days
                      </td>
                      <td className={item.days_of_cover <= 30 ? 'forecast-risk' : ''}>{item.estimated_stockout_date}</td>
                      <td><span className={`confidence-badge ${item.confidence.toLowerCase()}`}>{item.confidence}</span></td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="6" className="forecast-empty">Loading sales history and forecasts…</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Low Stock Reorder Table */}
          <div className="reorder-table-card">
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--text-main)', marginBottom: '14px' }}>
              ⚠️ Low Stock & Safety Threshold Alerts
            </h3>
            <div style={{ overflowX: 'auto' }}>
              <table className="reorder-table">
                <thead>
                  <tr>
                    <th>Product Name</th>
                    <th>Category</th>
                    <th>Current Stock</th>
                    <th>Reorder Threshold</th>
                    <th>Unit Price</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {analytics && analytics.reorder_alerts && analytics.reorder_alerts.length > 0 ? (
                    analytics.reorder_alerts.map(item => (
                      <tr key={item.product_id}>
                        <td>
                          <strong>{item.product_name}</strong>
                          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'block' }}>
                            ID #{item.product_id} {item.barcode && `• ${item.barcode}`}
                          </span>
                        </td>
                        <td>{item.category} ➔ {item.subcategory}</td>
                        <td>
                          <span style={{ color: '#DC2626', fontWeight: 800 }}>
                            {item.stock_level} Units
                          </span>
                        </td>
                        <td>{item.reorder_level} Units</td>
                        <td>₹{item.unit_price}</td>
                        <td>
                          <span className="reorder-pill">Restock Recommended</span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="6" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                        All products are currently well stocked above safety levels.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* 6. RECEIPT / INVOICE MODAL (Triggered upon Payment or Viewing Past Order) */}
      {(receiptModalOpen || viewingOrder) && (
        <div className="modal-overlay" onClick={() => { setReceiptModalOpen(false); setViewingOrder(null); }}>
          <div className="receipt-modal-card" onClick={(e) => e.stopPropagation()}>
            {/* Modal Top */}
            <div className="receipt-header">
              <div style={{ textAlign: 'center', width: '100%' }}>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--brand-burgundy)' }}>instamart</h2>
                <p style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-sub)', letterSpacing: '0.05em' }}>
                  TAX INVOICE & CASH RECEIPT
                </p>
              </div>
              <button 
                onClick={() => { setReceiptModalOpen(false); setViewingOrder(null); }}
                className="btn-close-receipt"
              >
                <X size={18} />
              </button>
            </div>

            {/* Receipt Body */}
            {(() => {
              const ord = viewingOrder || lastCompletedOrder;
              if (!ord) return null;
              return (
                <div className="receipt-body">
                  <div className="receipt-meta-grid">
                    <div>
                      <span className="receipt-meta-label">Invoice ID</span>
                      <strong className="receipt-meta-val">{ord.order_id}</strong>
                    </div>
                    <div>
                      <span className="receipt-meta-label">Date & Time</span>
                      <strong className="receipt-meta-val">{ord.created_at}</strong>
                    </div>
                    <div>
                      <span className="receipt-meta-label">Customer</span>
                      <strong className="receipt-meta-val">{ord.customer_name}</strong>
                    </div>
                    <div>
                      <span className="receipt-meta-label">Payment Mode</span>
                      <strong className="receipt-meta-val" style={{ color: 'var(--brand-green)' }}>{ord.payment_method}</strong>
                    </div>
                  </div>

                  <div className="receipt-divider"></div>

                  <table className="receipt-items-table">
                    <thead>
                      <tr>
                        <th>Item</th>
                        <th style={{ textAlign: 'center' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Rate</th>
                        <th style={{ textAlign: 'right' }}>Amt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ord.items && ord.items.map((it, idx) => (
                        <tr key={idx}>
                          <td>
                            <div style={{ fontWeight: 700 }}>{it.product_name}</div>
                            {it.barcode && <div style={{ fontSize: '0.68rem', color: '#94A3B8' }}>{it.barcode}</div>}
                          </td>
                          <td style={{ textAlign: 'center' }}>{it.quantity}</td>
                          <td style={{ textAlign: 'right' }}>₹{it.unit_price.toFixed(0)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 700 }}>₹{(it.quantity * it.unit_price).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="receipt-divider"></div>

                  {/* Decremented Inventory Notice */}
                  {ord.inventory_updates && ord.inventory_updates.length > 0 && (
                    <div className="receipt-stock-notice">
                      <span style={{ fontWeight: 700, display: 'block', marginBottom: '4px' }}>
                        📦 Inventory CSV Decrement Status:
                      </span>
                      {ord.inventory_updates.map((u, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.74rem' }}>
                          <span>{u.product_name}</span>
                          <span style={{ color: 'var(--brand-burgundy)', fontWeight: 700 }}>
                            {u.previous_stock} ➔ {u.remaining_stock} remaining
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="receipt-totals">
                    <div className="receipt-total-line">
                      <span>Subtotal:</span>
                      <span>₹{ord.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="receipt-total-line">
                      <span>GST (5%):</span>
                      <span>₹{ord.tax.toFixed(2)}</span>
                    </div>
                    <div className="receipt-total-line grand">
                      <span>TOTAL PAID:</span>
                      <span>₹{ord.total_amount.toFixed(2)}</span>
                    </div>
                  </div>

                  <div className="receipt-footer-buttons">
                    <button 
                      onClick={() => window.print()}
                      className="btn-print-receipt"
                    >
                      <Printer size={16} /> Print Receipt
                    </button>
                    <button 
                      onClick={() => {
                        setReceiptModalOpen(false);
                        setViewingOrder(null);
                        setActiveTab('billing');
                      }}
                      className="btn-new-bill-done"
                    >
                      + Start Next Bill
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
