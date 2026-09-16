import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  LayoutGrid, ShoppingCart, PackagePlus, Boxes, FileBarChart, Users, UserRound, Truck,
  Plus, Minus, Trash2, Search, X, Check, AlertTriangle, ChevronRight,
  Pencil, Store, TrendingUp, TrendingDown, Wallet, PackageSearch, Printer, Phone, ArrowLeft, Percent,
  Receipt, Download, Clock, List as ListIcon, FilePlus,
  Settings, UploadCloud, Copy, RotateCcw, Barcode, ShieldAlert, KeyRound, Camera, Ban, MessageCircle, MessageSquare, Send, ClipboardList, History,
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

// ---------- helpers ----------
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const todayStr = () => new Date().toISOString().slice(0, 10);
const money = (n) => "৳" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const bnDate = (iso) => new Date(iso).toLocaleDateString("bn-BD", { day: "2-digit", month: "short", year: "numeric" });
const bnDateTime = (ts) => new Date(ts).toLocaleString("bn-BD", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const daysBetween = (iso) => Math.ceil((new Date(iso) - new Date(todayStr())) / 86400000);
// ---------- WhatsApp/SMS রিমাইন্ডার লিংক ----------
// এখানে সরাসরি অটোমেটিক মেসেজ পাঠানো হয় না (তার জন্য পেইড SMS gateway/WhatsApp Business API লাগে) —
// বরং WhatsApp/SMS অ্যাপ prefilled মেসেজ নিয়ে খুলে যায়, ইউজার শুধু "Send" চাপবেন।
function bnPhoneToIntl(phone) {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  if (!digits) return "";
  if (digits.startsWith("880")) return digits;
  if (digits.startsWith("0")) return "880" + digits.slice(1);
  return digits;
}
function waLink(phone, message) {
  const intl = bnPhoneToIntl(phone);
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}
function waShareLink(message) {
  // নির্দিষ্ট নম্বর ছাড়া — WhatsApp-এ কন্টাক্ট বেছে নেওয়ার অপশন আসবে (নিজেকে/স্টাফ গ্রুপকে পাঠানোর জন্য)
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
function smsLink(phone, message) {
  const digits = (phone || "").replace(/[^0-9]/g, "");
  return `sms:${digits}?body=${encodeURIComponent(message)}`;
}
const escapeHtml = (s) => String(s ?? "").replace(/[&<>"\']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "\'": "&#39;" }[c]));
async function compressImageFile(file, maxWidth = 600, quality = 0.72) {
  if (!file) return "";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxWidth / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}
// পণ্যের বারকোড/SKU না থাকলেও লেবেল প্রিন্ট করা যায় — তখন পণ্যের ইউনিক আইডি দিয়ে কোড বানানো হয়
const labelCodeFor = (p) => (p.barcode && p.barcode.trim()) || (p.sku && p.sku.trim()) || p.id;

// ---------- ব্যাচ/লট-ভিত্তিক স্টক ও মেয়াদ ----------
// পণ্যের ঐচ্ছিক `batches` অ্যারে থাকতে পারে: [{id, batchNo, expiry, qty}]।
// batches থাকলে পণ্যের `stock` ও `expiry` ফিল্ড সবসময় ব্যাচগুলো থেকে হিসাব করে অটো-সিঙ্ক রাখা হয় —
// এভাবে বাকি পুরো অ্যাপ (যেখানে p.stock/p.expiry সরাসরি পড়া হয়) না বদলিয়েই ব্যাচ-ট্র্যাকিং কাজ করে।
// batches না থাকলে (পুরনো/সাধারণ পণ্য) আগের মতোই একটামাত্র stock+expiry ফিল্ড ব্যবহার হয়।
function syncStockFromBatches(p) {
  if (!p.batches || !p.batches.length) return p;
  const stock = p.batches.reduce((a, b) => a + (Number(b.qty) || 0), 0);
  const withExp = p.batches.filter((b) => b.expiry).sort((a, b) => a.expiry.localeCompare(b.expiry));
  return { ...p, stock, expiry: withExp.length ? withExp[0].expiry : "" };
}
function blankBatch() { return { id: uid(), batchNo: "", expiry: "", qty: "" }; }
function cleanBatches(list) {
  return (list || [])
    .filter((b) => (b.batchNo && b.batchNo.trim()) || b.expiry || (b.qty !== "" && Number(b.qty) > 0))
    .map((b) => ({ id: b.id || uid(), batchNo: (b.batchNo || "").trim(), expiry: b.expiry || "", qty: Number(b.qty) || 0 }));
}

// ---------- মোবাইল ব্যাংকিং / পেমেন্ট মাধ্যম ----------
const MOBILE_BANKING_METHODS = ["বিকাশ", "নগদ (Nagad)", "রকেট", "উপায়"];
const PAY_METHODS = ["ক্যাশ", ...MOBILE_BANKING_METHODS, "কার্ড", "ব্যাংক"];
function payMethodFlags(payMethod) {
  const isMobileBanking = MOBILE_BANKING_METHODS.includes(payMethod);
  return {
    isMobileBanking,
    needsTxn: isMobileBanking || payMethod === "কার্ড" || payMethod === "ব্যাংক",
    needsSenderNumber: isMobileBanking,
    needsBankAcc: payMethod === "ব্যাংক",
  };
}

// ---------- sound effects ----------
function playTone(freq, duration, type = "sine", delay = 0, gainVal = 0.16) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    const start = ctx.currentTime + delay;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(gainVal, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start(start); osc.stop(start + duration + 0.02);
  } catch (e) { /* audio not available */ }
}
function playSuccessSound() { playTone(880, 0.12); playTone(1320, 0.16, "sine", 0.09); }
function playErrorSound() { playTone(260, 0.16, "square"); playTone(180, 0.22, "square", 0.1); }

// Firebase Firestore-ভিত্তিক storage — get/set এর সিগনেচার আগের window.storage র‍্যাপারের মতোই রাখা হয়েছে
// যাতে বাকি পুরো অ্যাপ (যেখানে storeGet/storeSet কল হয়) অপরিবর্তিত থাকে।
import { storeGet, storeSet } from "./firebase.js";
function shopSignIn() {}
function shopSignUp() {}
function shopSignOut() {}

// ---------- দোকান-কোড ভিত্তিক ডেটা আলাদাকরণ ----------
// আগে মাল্টি-ব্রাঞ্চ/মাল্টি-ডিভাইস সাপোর্টের জন্য একটা "দোকান-কোড" (ShopGate) স্ক্রিন ছিল,
// যেখানে অ্যাপ খোলার সময় কোড দিয়ে লগইন/join করা লাগতো। এখন যেহেতু এই সফটওয়্যারটা
// শুধু একটা দোকানের জন্যই ব্যবহার হবে, তাই ঐ স্ক্রিনটা সরিয়ে ফেলা হয়েছে — অ্যাপ খুললেই
// সরাসরি দোকানে ঢুকে যাবে। ডেটা স্টোরেজের key বানাতে shopKey() এখনো ব্যবহার হয়,
// শুধু কোডটা এখন ফিক্সড (SINGLE_SHOP_CODE, নিচে App()-এ দেখুন)।
function shopKey(shopCode, name) { return `shop:${shopCode}:${name}`; }

const NAV = [
  { id: "dashboard", label: "ড্যাশবোর্ড", icon: LayoutGrid },
  { id: "sales", label: "বিক্রয়", icon: ShoppingCart },
  { id: "purchase", label: "ক্রয়", icon: PackagePlus },
  { id: "stock", label: "স্টক / পণ্য", icon: Boxes },
  { id: "customers", label: "কাস্টমার / বাকি", icon: UserRound },
  { id: "suppliers", label: "সাপ্লায়ার", icon: Truck },
  { id: "expenses", label: "খরচ", icon: Wallet },
  { id: "reports", label: "রিপোর্ট", icon: FileBarChart },
  { id: "employees", label: "কর্মচারী", icon: Users },
  { id: "settings", label: "সেটিংস ও ব্যাকআপ", icon: Settings },
  { id: "activityLog", label: "অ্যাক্টিভিটি লগ", icon: History },
  { id: "shifts", label: "শিফট / ক্যাশ মিলান", icon: Wallet },
  { id: "advanced", label: "ফার্মেসি অপারেশন", icon: ClipboardList },
];
const NAV_GROUPS = [
  { id: "home", label: "হোম", items: ["dashboard"] },
  { id: "sales", label: "বিক্রয় / POS", items: ["sales", "customers"] },
  { id: "purchase", label: "ক্রয় ও সাপ্লায়ার", items: ["purchase", "suppliers"] },
  { id: "inventory", label: "ইনভেন্টরি", items: ["stock"] },
  { id: "pharmacy", label: "ফার্মেসি অপারেশন", items: ["advanced"] },
  { id: "finance", label: "হিসাব ও রিপোর্ট", items: ["expenses", "reports", "shifts"] },
  { id: "security", label: "কর্মী ও নিরাপত্তা", items: ["employees", "activityLog", "settings"] },
];

// ---------- অ্যাক্টিভিটি লগের অ্যাকশন-টাইপ ও লেবেল ----------
const ACTIVITY_ACTION_LABELS = {
  sale: "বিক্রয়",
  sale_return: "বিক্রয় রিটার্ন",
  purchase: "ক্রয়",
  product_add: "পণ্য যোগ",
  product_edit: "পণ্য সম্পাদনা",
  product_delete: "পণ্য মুছে ফেলা",
  write_off: "নষ্ট/ক্ষতি (write-off)",
  customer_payment: "কাস্টমার পেমেন্ট আদায়",
  supplier_payment: "সাপ্লায়ার পেমেন্ট পরিশোধ",
  expense_add: "খরচ যোগ",
  employee_add: "কর্মচারী যোগ",
  employee_delete: "কর্মচারী মুছে ফেলা",
  employee_pin_change: "কর্মচারীর পিন বদল",
  discount_override: "বড় ছাড়ে মালিকের অনুমোদন",
  backup_restore: "ব্যাকআপ রিস্টোর",
  stock_adjust: "স্টক সমন্বয়",
  shift_start: "শিফট শুরু",
  shift_end: "শিফট শেষ",
  sale_cancel: "বিক্রয় বাতিল",
};

function payStatus(total, due) {
  if (due <= 0) return { label: "পরিশোধিত", tone: "green" };
  if (due < total) return { label: "আংশিক", tone: "gold" };
  return { label: "বাকি", tone: "red" };
}

function DokanApp({ shopCode, onShopLogout }) {
  const [loaded, setLoaded] = useState(false);
  const [shopName, setShopName] = useState("আমার দোকান");
  const [shopPhone, setShopPhone] = useState("");
  const [shopTaxRate, setShopTaxRate] = useState(0);
  const [shopMfsNumber, setShopMfsNumber] = useState(""); // দোকানের বিকাশ/নগদ/রকেট নম্বর (পেমেন্ট নেওয়ার জন্য)
  const [shopBin, setShopBin] = useState(""); // ভ্যাট রেজিস্ট্রেশন BIN নম্বর (ঐচ্ছিক)
  const [invoiceFormat, setInvoiceFormat] = useState("a4"); // "a4" | "thermal58" | "thermal80"
  const [discountPinLimit, setDiscountPinLimit] = useState(15); // এর বেশি % ছাড় দিতে গেলে মালিকের PIN লাগবে (কর্মচারীর জন্য)
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [returns, setReturns] = useState([]);
  const [writeOffs, setWriteOffs] = useState([]); // মেয়াদ-শেষ/নষ্ট হয়ে যাওয়া স্টক বাদ দেওয়ার হিসাব
  const [purchaseOrders, setPurchaseOrders] = useState([]); // রি-অর্ডার/PO — "অর্ডার দিলাম" আর "ক্রয় সম্পন্ন করলাম" আলাদা ধাপ
  const [activityLogs, setActivityLogs] = useState([]); // অ্যাক্টিভিটি/অডিট লগ — কে, কখন, কী করলো
  const [shifts, setShifts] = useState([]);
  const [currentShiftId, setCurrentShiftId] = useState(null);
  const [parkedSales, setParkedSales] = useState([]);
  const [darkMode, setDarkMode] = useState(false);
  const [advancedRecords, setAdvancedRecords] = useState({ purchaseReturns: [], supplierReturns: [], refundRequests: [], transfers: [], reconciliations: [], permissions: {}, branches: ["মূল শাখা"], warehouses: ["মূল গুদাম"], taxConfig: { vatRate: 0, bin: "" }, securityConfig: { sessionMinutes: 30, maxPinAttempts: 5 } });
  const [currentUser, setCurrentUser] = useState(null);
  const [tab, setTab] = useState("dashboard");
  const [toast, setToast] = useState(null);
  const [invoiceSale, setInvoiceSale] = useState(null);
  const [purchaseSlip, setPurchaseSlip] = useState(null);
  const [labelProduct, setLabelProduct] = useState(null);

  const k = (name) => shopKey(shopCode, name);

  useEffect(() => {
    (async () => {
      const [sn, sp, stx, smfs, sbin, sfmt, dpl, p, s, pu, e, cu, su, pay, ex, ret, wo, po, al, sh, adv, parked] = await Promise.all([
        storeGet(k("shop-name"), true), storeGet(k("shop-phone"), true), storeGet(k("shop-tax-rate"), true),
        storeGet(k("shop-mfs-number"), true), storeGet(k("shop-bin"), true), storeGet(k("shop-invoice-format"), true),
        storeGet(k("shop-discount-pin-limit"), true),
        storeGet(k("products"), true), storeGet(k("sales"), true), storeGet(k("purchases"), true),
        storeGet(k("employees"), true), storeGet(k("customers"), true), storeGet(k("suppliers"), true),
        storeGet(k("payments"), true), storeGet(k("expenses"), true), storeGet(k("returns"), true),
        storeGet(k("write-offs"), true), storeGet(k("purchase-orders"), true), storeGet(k("activity-logs"), true), storeGet(k("shifts"), true), storeGet(k("advanced-records"), true), storeGet(k("parked-sales"), true),
      ]);
      if (sn) setShopName(sn);
      if (sp) setShopPhone(sp);
      if (stx !== null && stx !== undefined) setShopTaxRate(stx);
      if (smfs) setShopMfsNumber(smfs);
      if (sbin) setShopBin(sbin);
      if (sfmt) setInvoiceFormat(sfmt);
      if (dpl !== null && dpl !== undefined) setDiscountPinLimit(dpl);
      setProducts(p || []); setSales(s || []); setPurchases(pu || []);
      setEmployees(e && e.length ? e : [{ id: uid(), name: "মালিক", role: "owner", pin: "0000" }]);
      setCustomers(cu || []); setSuppliers(su || []); setPayments(pay || []); setExpenses(ex || []);
      setReturns(ret || []); setWriteOffs(wo || []); setPurchaseOrders(po || []);
      setActivityLogs(al || []);
      setShifts(sh || []);
      if (adv) setAdvancedRecords({ ...advancedRecords, ...adv });
      setParkedSales(parked || []);
      const open = (sh || []).find((x) => x.status === "open");
      setCurrentShiftId(open?.id || null);
      setLoaded(true);
    })();
  }, [shopCode]);

  useEffect(() => { if (loaded) storeSet(k("employees"), employees, true); }, [employees, loaded]);
  useEffect(() => { if (loaded) storeSet(k("products"), products, true); }, [products, loaded]);
  useEffect(() => { if (loaded) storeSet(k("sales"), sales, true); }, [sales, loaded]);
  useEffect(() => { if (loaded) storeSet(k("purchases"), purchases, true); }, [purchases, loaded]);
  useEffect(() => { if (loaded) storeSet(k("shop-name"), shopName, true); }, [shopName, loaded]);
  useEffect(() => { if (loaded) storeSet(k("shop-phone"), shopPhone, true); }, [shopPhone, loaded]);
  useEffect(() => { if (loaded) storeSet(k("shop-tax-rate"), shopTaxRate, true); }, [shopTaxRate, loaded]);
  useEffect(() => { if (loaded) storeSet(k("shop-mfs-number"), shopMfsNumber, true); }, [shopMfsNumber, loaded]);
  useEffect(() => { if (loaded) storeSet(k("shop-bin"), shopBin, true); }, [shopBin, loaded]);
  useEffect(() => { if (loaded) storeSet(k("shop-invoice-format"), invoiceFormat, true); }, [invoiceFormat, loaded]);
  useEffect(() => { if (loaded) storeSet(k("shop-discount-pin-limit"), discountPinLimit, true); }, [discountPinLimit, loaded]);
  useEffect(() => { if (loaded) storeSet(k("customers"), customers, true); }, [customers, loaded]);
  useEffect(() => { if (loaded) storeSet(k("suppliers"), suppliers, true); }, [suppliers, loaded]);
  useEffect(() => { if (loaded) storeSet(k("payments"), payments, true); }, [payments, loaded]);
  useEffect(() => { if (loaded) storeSet(k("expenses"), expenses, true); }, [expenses, loaded]);
  useEffect(() => { if (loaded) storeSet(k("returns"), returns, true); }, [returns, loaded]);
  useEffect(() => { if (loaded) storeSet(k("write-offs"), writeOffs, true); }, [writeOffs, loaded]);
  useEffect(() => { if (loaded) storeSet(k("purchase-orders"), purchaseOrders, true); }, [purchaseOrders, loaded]);
  useEffect(() => { if (loaded) storeSet(k("activity-logs"), activityLogs, true); }, [activityLogs, loaded]);
  useEffect(() => { if (loaded) storeSet(k("shifts"), shifts, true); }, [shifts, loaded]);
  useEffect(() => { if (loaded) storeSet(k("parked-sales"), parkedSales, true); }, [parkedSales, loaded]);
  useEffect(() => { const fn = (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); } }; window.addEventListener("keydown", fn); return () => window.removeEventListener("keydown", fn); }, []);
  useEffect(() => { if (loaded) storeSet(k("advanced-records"), advancedRecords, true); }, [advancedRecords, loaded]);

  function pushToast(msg, kind = "ok") { setToast({ msg, kind, key: uid() }); if (kind === "warn") playErrorSound(); else playSuccessSound(); setTimeout(() => setToast(null), 2400); }

  // অ্যাক্টিভিটি/অডিট লগে একটা এন্ট্রি যোগ করে — কে (currentUser), কখন, কোন অ্যাকশন, কী বিস্তারিত।
  // স্টোরেজ (৫MB/key) যাতে কখনো উপচে না যায়, তাই সবসময় সাম্প্রতিক ৳৫০০০টা এন্ট্রি রাখা হয়।
  function logActivity(action, details = "", extra = {}) {
    setActivityLogs((prev) => [
      { id: uid(), ts: Date.now(), userId: currentUser?.id || null, userName: currentUser?.name || "সিস্টেম", action, details, ...extra },
      ...prev,
    ].slice(0, 5000));
  }

  const OWNER_ONLY_TABS = ["reports", "expenses", "employees", "settings", "activityLog", "shifts", "advanced"];
  useEffect(() => {
    if (currentUser && currentUser.role !== "owner" && OWNER_ONLY_TABS.includes(tab)) {
      setTab("dashboard");
    }
  }, [tab, currentUser]);

  if (!loaded) {
    return <Shell><div className="w-full h-full flex items-center justify-center" style={{ minHeight: 400 }}><div style={{ color: "var(--ink-faint)" }}>খাতা খোলা হচ্ছে…</div></div></Shell>;
  }
  if (!currentUser) {
    return <Shell><LoginScreen shopName={shopName} setShopName={setShopName} employees={employees} setEmployees={setEmployees} onEnter={setCurrentUser} onShopLogout={onShopLogout} /></Shell>;
  }

  const isOwner = currentUser.role === "owner";
  const lowStockCount = products.filter((p) => p.stock <= (p.lowStockAt ?? 5)).length;

  return (
    <Shell>
      <div className="flex w-full" style={{ minHeight: 640 }}>
        <Sidebar tab={tab} setTab={setTab} shopName={shopName} shopPhone={shopPhone} currentUser={currentUser} onLogout={() => setCurrentUser(null)} isOwner={isOwner} ownerOnlyTabs={OWNER_ONLY_TABS} shopCode={shopCode} lowStockCount={lowStockCount} />
        <main className="flex-1 relative" style={{ background: "var(--paper)" }}>
          <LedgerLines />
          <div className="relative z-10 p-5 md:p-8 pb-24 md:pb-8">
            {tab === "dashboard" && <Dashboard products={products} sales={sales} purchases={purchases} customers={customers} suppliers={suppliers} payments={payments} expenses={expenses} setTab={setTab} onPrint={setInvoiceSale} isOwner={isOwner} />}
            {tab === "sales" && <SalesTab products={products} setProducts={setProducts} sales={sales} setSales={setSales} returns={returns} setReturns={setReturns} customers={customers} setCustomers={setCustomers} payments={payments} currentUser={currentUser} pushToast={pushToast} onPrint={setInvoiceSale} shopTaxRate={shopTaxRate} shopMfsNumber={shopMfsNumber} logActivity={logActivity} isOwner={isOwner} employees={employees} discountPinLimit={discountPinLimit} shifts={shifts} currentShiftId={currentShiftId} parkedSales={parkedSales} setParkedSales={setParkedSales} />}
            {tab === "purchase" && <PurchaseTab products={products} setProducts={setProducts} purchases={purchases} setPurchases={setPurchases} suppliers={suppliers} setSuppliers={setSuppliers} payments={payments} currentUser={currentUser} pushToast={pushToast} purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders} onPrint={setPurchaseSlip} logActivity={logActivity} />}
            {tab === "stock" && <StockTab products={products} setProducts={setProducts} pushToast={pushToast} onPrintLabel={setLabelProduct} writeOffs={writeOffs} setWriteOffs={setWriteOffs} suppliers={suppliers} purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders} logActivity={logActivity} />}
            {tab === "customers" && <CustomersTab customers={customers} setCustomers={setCustomers} sales={sales} payments={payments} setPayments={setPayments} pushToast={pushToast} onPrint={setInvoiceSale} shopName={shopName} logActivity={logActivity} />}
            {tab === "suppliers" && <SuppliersTab suppliers={suppliers} setSuppliers={setSuppliers} purchases={purchases} payments={payments} setPayments={setPayments} pushToast={pushToast} onPrint={setPurchaseSlip} logActivity={logActivity} />}
            {tab === "expenses" && isOwner && <ExpensesTab expenses={expenses} setExpenses={setExpenses} currentUser={currentUser} pushToast={pushToast} logActivity={logActivity} />}
            {tab === "reports" && isOwner && <ReportsTab sales={sales} purchases={purchases} products={products} expenses={expenses} writeOffs={writeOffs} />}
            {tab === "employees" && isOwner && <EmployeesTab employees={employees} setEmployees={setEmployees} pushToast={pushToast} logActivity={logActivity} />}
            {tab === "activityLog" && isOwner && <ActivityLogTab logs={activityLogs} employees={employees} />}
            {tab === "shifts" && isOwner && <ShiftTab shifts={shifts} setShifts={setShifts} currentShiftId={currentShiftId} setCurrentShiftId={setCurrentShiftId} currentUser={currentUser} sales={sales} pushToast={pushToast} logActivity={logActivity} />}
            {tab === "advanced" && isOwner && <AdvancedPharmacyTab records={advancedRecords} setRecords={setAdvancedRecords} products={products} setSales={setSales} setProducts={setProducts} purchases={purchases} sales={sales} customers={customers} employees={employees} currentUser={currentUser} pushToast={pushToast} logActivity={logActivity} />}
            {tab === "settings" && isOwner && <SettingsBackupTab
              shopCode={shopCode} shopName={shopName} setShopName={setShopName} shopPhone={shopPhone} setShopPhone={setShopPhone}
              shopTaxRate={shopTaxRate} setShopTaxRate={setShopTaxRate}
              shopMfsNumber={shopMfsNumber} setShopMfsNumber={setShopMfsNumber}
              shopBin={shopBin} setShopBin={setShopBin}
              invoiceFormat={invoiceFormat} setInvoiceFormat={setInvoiceFormat}
              discountPinLimit={discountPinLimit} setDiscountPinLimit={setDiscountPinLimit}
              allData={{ products, sales, purchases, employees, customers, suppliers, payments, expenses, returns, writeOffs, purchaseOrders, activityLogs, shifts, shopName, shopPhone, shopTaxRate, shopMfsNumber, shopBin, invoiceFormat, discountPinLimit }}
              restoreData={(d) => {
                if (d.products) setProducts(d.products);
                if (d.sales) setSales(d.sales);
                if (d.purchases) setPurchases(d.purchases);
                if (d.employees && d.employees.length) setEmployees(d.employees);
                if (d.customers) setCustomers(d.customers);
                if (d.suppliers) setSuppliers(d.suppliers);
                if (d.payments) setPayments(d.payments);
                if (d.expenses) setExpenses(d.expenses);
                if (d.returns) setReturns(d.returns);
                if (d.writeOffs) setWriteOffs(d.writeOffs);
                if (d.purchaseOrders) setPurchaseOrders(d.purchaseOrders);
                if (d.activityLogs) setActivityLogs(d.activityLogs);
                if (d.shifts) setShifts(d.shifts);
                if (d.shopName) setShopName(d.shopName);
                if (typeof d.shopPhone === "string") setShopPhone(d.shopPhone);
                if (typeof d.shopTaxRate === "number") setShopTaxRate(d.shopTaxRate);
                if (typeof d.shopMfsNumber === "string") setShopMfsNumber(d.shopMfsNumber);
                if (typeof d.shopBin === "string") setShopBin(d.shopBin);
                if (typeof d.invoiceFormat === "string") setInvoiceFormat(d.invoiceFormat);
                if (typeof d.discountPinLimit === "number") setDiscountPinLimit(d.discountPinLimit);
                logActivity("backup_restore", "ব্যাকআপ ফাইল থেকে ডেটা রিস্টোর করা হয়েছে");
              }}
              pushToast={pushToast}
            />}
          </div>
        </main>
      </div>
      <MobileTabBar tab={tab} setTab={setTab} isOwner={isOwner} ownerOnlyTabs={OWNER_ONLY_TABS} lowStockCount={lowStockCount} />
      {toast && <Toast toast={toast} />}
      {invoiceSale && <InvoiceModal sale={invoiceSale} shopName={shopName} shopPhone={shopPhone} shopBin={shopBin} invoiceFormat={invoiceFormat} onClose={() => setInvoiceSale(null)} />}
      {purchaseSlip && <PurchaseSlipModal purchase={purchaseSlip} shopName={shopName} shopPhone={shopPhone} shopBin={shopBin} invoiceFormat={invoiceFormat} onClose={() => setPurchaseSlip(null)} />}
      {labelProduct && <LabelModal product={labelProduct} shopName={shopName} onClose={() => setLabelProduct(null)} />}
    </Shell>
  );
}

// ---------- shell / theme ----------
function Shell({ children }) {
  return (
    <div style={{ fontFamily: "var(--font-body)" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+Bengali:wght@500;700;900&family=Noto+Sans+Bengali:wght@400;500;600;700&family=Tiro+Bangla&display=swap');
        :root {
          --paper: #FFFFFF; --paper-edge: #EEF4FC; --ink: #16233D; --ink-faint: #64748B;
          --rule-blue: #DCE8F7; --margin-red: #2E6DE0; --stamp: #D64545; --gold: #2E6DE0;
          --green: #1E8E5A; --tab-navy: #1D4ED8; --tab-navy-light: #2E6DE0;
          --font-display: 'Noto Serif Bengali', serif; --font-body: 'Noto Sans Bengali', 'Tiro Bangla', sans-serif;
        }
        * { box-sizing: border-box; }
        .ledger-btn { font-family: var(--font-body); border: 1.5px solid var(--ink); background: var(--paper); color: var(--ink); padding: 8px 16px; font-weight: 600; transition: transform .08s ease, box-shadow .12s ease; cursor: pointer; display:inline-flex; align-items:center; text-decoration:none; }
        .ledger-btn:hover { box-shadow: 3px 3px 0 var(--tab-navy); transform: translate(-2px,-2px); }
        .ledger-btn:active { box-shadow: none; transform: translate(0,0); }
        .ledger-btn-solid { background: var(--tab-navy); color: #FFFFFF; border-color: var(--tab-navy); }
        .ledger-btn-navy { background: var(--tab-navy); color: #FFFFFF; border-color: var(--tab-navy); }
        .ledger-btn-sm { padding: 5px 10px; font-size: 13px; }
        .stamp-pop { animation: stampIn .35s cubic-bezier(.2,1.4,.4,1) both; }
        @keyframes stampIn { 0% { opacity: 0; transform: scale(2.2) rotate(-14deg); } 60% { opacity: 1; } 100% { opacity: 1; transform: scale(1) rotate(-8deg); } }
        .field { font-family: var(--font-body); border: none; border-bottom: 1.5px solid var(--ink); background: transparent; padding: 6px 4px; color: var(--ink); width: 100%; outline: none; }
        .field:focus { border-bottom-color: var(--tab-navy); }
        ::selection { background: var(--tab-navy); color: #fff; }
        .tab-btn { position: relative; }
        .tab-btn.active::before { content: ""; position: absolute; left: -22px; top: 0; bottom: 0; width: 6px; background: var(--tab-navy); }
        .badge { font-size: 11px; padding: 2px 8px; font-weight: 700; display:inline-block; }
        .subnav-btn { padding: 6px 14px; font-weight: 600; font-size: 14px; border: 1.5px solid var(--ink); cursor: pointer; background: var(--paper); }
        .subnav-btn.active { background: var(--tab-navy); color: #fff; border-color: var(--tab-navy); }
      `}</style>
      <div style={{ background: "var(--paper-edge)", minHeight: "100%" }} className="w-full">{children}</div>
    </div>
  );
}
function LedgerLines() {
  return (
    <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 34px, var(--rule-blue) 35px)", opacity: 0.45 }}>
      <div className="absolute top-0 bottom-0" style={{ left: 64, width: 1.5, background: "var(--margin-red)", opacity: 0.55 }} />
    </div>
  );
}

// ---------- login ----------
function LoginScreen({ shopName, setShopName, employees, setEmployees, onEnter, onShopLogout }) {
  const [editingName, setEditingName] = useState(false);
  const [newEmp, setNewEmp] = useState("");
  const [pinFor, setPinFor] = useState(null); // যেই employee এর pin চাওয়া হচ্ছে
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");

  function tryEnter(e) {
    setPinFor(e); setPinInput(""); setPinError("");
  }
  function submitPin() {
    if (pinInput === (pinFor.pin || "0000")) {
      playSuccessSound();
      onEnter(pinFor);
    } else {
      setPinError("পিন মিলছে না, আবার চেষ্টা করুন");
      playErrorSound();
    }
  }

  if (pinFor) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center p-6">
        <div className="w-full max-w-sm border-2 p-6" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          <div className="text-center mb-4">
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22 }}>{pinFor.name}</div>
            <div className="text-sm" style={{ color: "var(--ink-faint)" }}>পিন কোড দিন</div>
          </div>
          <input
            autoFocus type="password" inputMode="numeric" maxLength={6}
            className="field text-center mb-2" style={{ fontSize: 22, letterSpacing: 6 }}
            placeholder="••••" value={pinInput}
            onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, "")); setPinError(""); }}
            onKeyDown={(e) => e.key === "Enter" && submitPin()}
          />
          {pinError && <div className="text-sm text-center mb-2" style={{ color: "var(--stamp)" }}>{pinError}</div>}
          <div className="flex gap-2 mt-3">
            <button className="ledger-btn flex-1" onClick={() => setPinFor(null)}><ArrowLeft size={16} className="mr-1" /> ফিরে যান</button>
            <button className="ledger-btn ledger-btn-solid flex-1 justify-center" onClick={submitPin}>ঢুকুন</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <Store size={28} style={{ color: "var(--stamp)" }} />
          {editingName ? (
            <input autoFocus className="field text-center" style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 900, color: "var(--ink)" }}
              value={shopName} onChange={(e) => setShopName(e.target.value)} onBlur={() => setEditingName(false)} onKeyDown={(e) => e.key === "Enter" && setEditingName(false)} />
          ) : (
            <h1 onClick={() => setEditingName(true)} style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 900, color: "var(--ink)", cursor: "text" }} title="নাম পরিবর্তন করতে ক্লিক করুন">{shopName}</h1>
          )}
        </div>
        <p className="text-center mb-6" style={{ color: "var(--ink-faint)" }}>খাতা খুলতে আপনার নাম বেছে নিন</p>
        <div className="border-2 p-5" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          <div className="flex flex-col gap-2 mb-4">
            {employees.map((e) => (
              <button key={e.id} onClick={() => tryEnter(e)} className="ledger-btn flex items-center justify-between">
                <span>{e.name}</span>
                <span className="flex items-center gap-2 text-sm" style={{ color: "var(--ink-faint)" }}>{e.role === "owner" ? "মালিক" : "কর্মচারী"} <ChevronRight size={16} /></span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input className="field" placeholder="নতুন নাম যোগ করুন…" value={newEmp} onChange={(e) => setNewEmp(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newEmp.trim()) { setEmployees([...employees, { id: uid(), name: newEmp.trim(), role: "staff", pin: "0000" }]); setNewEmp(""); } }} />
            <button className="ledger-btn" onClick={() => { if (!newEmp.trim()) return; setEmployees([...employees, { id: uid(), name: newEmp.trim(), role: "staff", pin: "0000" }]); setNewEmp(""); }}><Plus size={18} /></button>
          </div>
          <div className="text-xs mt-2" style={{ color: "var(--ink-faint)" }}>নতুন যোগ করা কর্মচারীর ডিফল্ট পিন থাকবে <b>0000</b> — কর্মচারী ট্যাব থেকে বদলে নিন।</div>
        </div>
        {onShopLogout && (
          <div className="text-center mt-4">
            <button onClick={onShopLogout} className="text-xs underline" style={{ color: "var(--ink-faint)" }}>দোকানের অ্যাকাউন্ট থেকে লগ আউট</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- sidebar ----------
function Sidebar({ tab, setTab, shopName, shopPhone, currentUser, onLogout, isOwner, ownerOnlyTabs = [], shopCode, lowStockCount = 0 }) {
  const navItems = isOwner ? NAV : NAV.filter((n) => !ownerOnlyTabs.includes(n.id));
  const [openGroups, setOpenGroups] = useState(() => Object.fromEntries(NAV_GROUPS.map((g) => [g.id, true])));
  const itemById = Object.fromEntries(navItems.map((n) => [n.id, n]));
  return (
    <aside className="hidden md:flex flex-col justify-between shrink-0" style={{ width: 240, background: "var(--tab-navy)", color: "#FBF6E9" }}>
      <div>
        <div className="p-5 border-b" style={{ borderColor: "rgba(251,246,233,0.15)" }}>
          <div className="flex items-center gap-2">
            <Store size={20} style={{ color: "var(--gold)" }} />
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>{shopName}</div>
          </div>
          {shopPhone && <div className="text-xs mt-1 flex items-center gap-1" style={{ color: "rgba(251,246,233,0.6)" }}><Phone size={11} /> {shopPhone}</div>}
        </div>
        <nav className="py-6 flex flex-col gap-1 pl-8 pr-3 max-h-[70vh] overflow-y-auto">
          {NAV_GROUPS.map((g) => {
            const items = g.items.map((id) => itemById[id]).filter(Boolean);
            if (!items.length) return null;
            return <div key={g.id} className="mb-1">
              <button className="w-full flex items-center justify-between text-left px-2 py-1.5 text-xs" style={{ color: "rgba(251,246,233,0.55)", fontWeight: 700 }} onClick={() => setOpenGroups((v) => ({ ...v, [g.id]: !v[g.id] }))}><span>{g.label}</span><span>{openGroups[g.id] ? "−" : "+"}</span></button>
              {openGroups[g.id] && items.map((n) => { const Icon = n.icon; const active = tab === n.id; return <button key={n.id} onClick={() => setTab(n.id)} className={"tab-btn flex items-center gap-3 text-left py-2 " + (active ? "active" : "")} style={{ color: active ? "#fff" : "rgba(251,246,233,0.7)", fontWeight: active ? 700 : 500, background: active ? "var(--tab-navy-light)" : "transparent", paddingLeft: 10 }}><Icon size={17} /><span className="flex-1">{n.label}</span>{n.id === "stock" && lowStockCount > 0 && <span className="flex items-center justify-center" style={{ minWidth: 20, height: 20, padding: "0 5px", borderRadius: 999, background: "var(--stamp)", color: "#fff", fontSize: 11, fontWeight: 800 }}>{lowStockCount}</span>}</button>; })}
            </div>;
          })}
        </nav>
      </div>
      <div className="p-5 border-t" style={{ borderColor: "rgba(251,246,233,0.15)" }}>
        <div className="text-xs mb-1" style={{ color: "rgba(251,246,233,0.55)" }}>লগইন করা আছেন</div>
        <div className="flex items-center justify-between"><span style={{ fontWeight: 600 }}>{currentUser.name}</span><button onClick={onLogout} className="text-xs underline" style={{ color: "var(--gold)" }}>বদলান</button></div>
      </div>
    </aside>
  );
}
function MobileTabBar({ tab, setTab, isOwner, ownerOnlyTabs = [], lowStockCount = 0 }) {
  const navItems = isOwner ? NAV : NAV.filter((n) => !ownerOnlyTabs.includes(n.id));
  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 flex overflow-x-auto"
      style={{ background: "var(--tab-navy)", borderTop: "2px solid var(--gold)" }}
    >
      {navItems.map((n) => {
        const Icon = n.icon;
        const active = tab === n.id;
        return (
          <button
            key={n.id}
            onClick={() => setTab(n.id)}
            className="flex flex-col items-center justify-center gap-0.5 py-2 px-3 shrink-0 relative"
            style={{ color: active ? "var(--gold)" : "rgba(251,246,233,0.7)", minWidth: 64 }}
          >
            <span className="relative">
              <Icon size={18} />
              {n.id === "stock" && lowStockCount > 0 && (
                <span className="absolute flex items-center justify-center" style={{ top: -6, right: -8, minWidth: 15, height: 15, padding: "0 3px", borderRadius: 999, background: "var(--stamp)", color: "#fff", fontSize: 9, fontWeight: 800 }}>{lowStockCount}</span>
              )}
            </span>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>{n.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// ---------- toast ----------
function Toast({ toast }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 stamp-pop" key={toast.key}>
      <div className="px-5 py-3 border-2 flex items-center gap-2 font-bold"
        style={{ background: toast.kind === "ok" ? "var(--paper)" : "#FBEAE7", borderColor: toast.kind === "ok" ? "var(--green)" : "var(--stamp)", color: toast.kind === "ok" ? "var(--green)" : "var(--stamp)", transform: "rotate(-3deg)" }}>
        {toast.kind === "ok" ? <Check size={18} /> : <AlertTriangle size={18} />}{toast.msg}
      </div>
    </div>
  );
}

// ---------- small ui atoms ----------
function SectionTitle({ children, icon: Icon, right }) {
  return (
    <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon size={22} style={{ color: "var(--stamp)" }} />}
        <h2 style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 24, color: "var(--ink)" }}>{children}</h2>
      </div>
      {right}
    </div>
  );
}
function StatCard({ label, value, icon: Icon, tone = "ink", onClick }) {
  const toneColor = { ink: "var(--ink)", green: "var(--green)", red: "var(--stamp)", gold: "var(--gold)" }[tone];
  return (
    <div onClick={onClick} className="border-2 p-4 flex items-start justify-between" style={{ borderColor: "var(--ink)", background: "var(--paper)", cursor: onClick ? "pointer" : "default" }}>
      <div><div className="text-sm mb-1" style={{ color: "var(--ink-faint)" }}>{label}</div><div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 24, color: toneColor }}>{value}</div></div>
      {Icon && <Icon size={20} style={{ color: toneColor, opacity: 0.7 }} />}
    </div>
  );
}
function Badge({ tone, children }) {
  const bg = { green: "var(--green)", gold: "var(--gold)", red: "var(--stamp)" }[tone];
  return <span className="badge" style={{ background: bg, color: "#fff" }}>{children}</span>;
}
function EmptyState({ text }) {
  return <div className="border-2 border-dashed p-8 text-center" style={{ borderColor: "var(--ink-faint)", color: "var(--ink-faint)" }}>{text}</div>;
}
function SubNav({ options, value, onChange }) {
  return (
    <div className="flex gap-2 mb-5">
      {options.map((o) => (
        <button key={o.id} className={"subnav-btn flex items-center gap-1.5 " + (value === o.id ? "active" : "")} onClick={() => onChange(o.id)}>
          {o.icon && <o.icon size={14} />} {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- due helpers ----------
function customerDue(customerId, sales, payments, customers) {
  const cust = customers?.find((c) => c.id === customerId);
  const opening = cust?.openingBalance || 0;
  const owed = sales.filter((s) => s.customerId === customerId).reduce((a, s) => a + (s.due || 0), 0);
  const paid = payments.filter((p) => p.type === "customer" && p.partyId === customerId).reduce((a, p) => a + p.amount, 0);
  return Math.max(0, opening + owed - paid);
}
function supplierDue(supplierId, purchases, payments, suppliers) {
  const sup = suppliers?.find((s) => s.id === supplierId);
  const opening = sup?.openingBalance || 0;
  const owed = purchases.filter((p) => p.supplierId === supplierId).reduce((a, p) => a + (p.due || 0), 0);
  const paid = payments.filter((p) => p.type === "supplier" && p.partyId === supplierId).reduce((a, p) => a + p.amount, 0);
  return Math.max(0, opening + owed - paid);
}

// ---------- invoice / document HTML + printing ----------
// format: "a4" (সাধারণ প্রিন্টার) | "thermal58" | "thermal80" (রিসিট প্রিন্টার)
function buildInvoiceHTML(sale, shopName, shopPhone, shopBin = "", format = "a4") {
  const isThermal = format === "thermal58" || format === "thermal80";
  const widthMm = format === "thermal58" ? 58 : 80;
  const rows = sale.items.map((it) => `
    <tr style="border-bottom:1px dotted #ccc">
      <td style="padding:${isThermal ? "2px 0" : "4px 0"}">${it.name}</td>
      <td style="padding:${isThermal ? "2px 0" : "4px 0"};text-align:center">${it.qty}${isThermal ? "" : ` ${it.unit}`}</td>
      <td style="padding:${isThermal ? "2px 0" : "4px 0"};text-align:right">${money(it.price)}</td>
      <td style="padding:${isThermal ? "2px 0" : "4px 0"};text-align:right">${money(it.qty * it.price)}</td>
    </tr>`).join("");
  const pageCss = isThermal
    ? `@page{size:${widthMm}mm auto;margin:2mm;} body{font-family:'Noto Sans Bengali','Nirmala UI',sans-serif;width:${widthMm - 4}mm;margin:0 auto;padding:0;font-size:11px;}`
    : `@page{size:auto;margin:12mm;} body{font-family:'Noto Sans Bengali','Nirmala UI',sans-serif;color:#111;max-width:420px;margin:24px auto;padding:0 16px;}`;
  return `<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8" />
    <title>ইনভয়েস #${sale.invoiceNo}</title>
    <style>
      ${pageCss}
      table{width:100%;border-collapse:collapse;font-size:${isThermal ? "11px" : "14px"};}
      th{text-align:left;border-bottom:1px solid #999;padding-bottom:4px;font-size:${isThermal ? "10px" : "13px"};color:#555;}
      .center{text-align:center}.right{text-align:right}
      .head{text-align:center;border-bottom:2px dashed #999;padding-bottom:${isThermal ? "6px" : "12px"};margin-bottom:${isThermal ? "6px" : "12px"};}
      .shop{font-weight:900;font-size:${isThermal ? "16px" : "22px"};}
      .muted{color:#666;font-size:${isThermal ? "10px" : "12px"};}
      .totals{border-top:2px dashed #999;padding-top:8px;margin-top:8px;font-size:${isThermal ? "12px" : "15px"};}
      .row{display:flex;justify-content:space-between;margin:2px 0;}
      .bold{font-weight:700;} .due{color:#A93226;}
      .btnbar{text-align:center;margin-top:18px;}
      .btnbar button{font-family:inherit;font-size:14px;font-weight:700;padding:8px 18px;border:1.5px solid #111;background:#A93226;color:#fff;cursor:pointer;}
      @media print { .btnbar{display:none;} body{margin:0;} }
    </style></head>
  <body>
    <div class="head">
      <div class="shop">${shopName}</div>
      ${shopPhone ? `<div class="muted">${shopPhone}</div>` : ""}
      ${shopBin ? `<div class="muted">BIN: ${shopBin}</div>` : ""}
      <div class="muted">ইনভয়েস #${sale.invoiceNo} • ${bnDateTime(sale.createdAt)}</div>
    </div>
    <div style="font-size:${isThermal ? "11px" : "14px"};margin-bottom:${isThermal ? "6px" : "10px"};">
      <div><b>ক্রেতা:</b> ${sale.customerName}</div>
      ${sale.customerPhone ? `<div><b>ফোন:</b> ${sale.customerPhone}</div>` : ""}
      ${sale.prescriptionRef ? `<div><b>Rx রেফারেন্স:</b> ${sale.prescriptionRef}</div>` : ""}
    </div>
    <table>
      <thead><tr><th>পণ্য</th><th class="center">পরিমাণ</th><th class="right">দাম</th><th class="right">মোট</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>সাবটোটাল</span><span>${money(sale.subtotal ?? sale.total)}</span></div>
      ${sale.discount ? `<div class="row"><span>ছাড়</span><span>-${money(sale.discount)}</span></div>` : ""}
      ${sale.tax ? `<div class="row"><span>ভ্যাট/ট্যাক্স (${sale.taxRate}%)</span><span>+${money(sale.tax)}</span></div>` : ""}
      ${sale.shipping ? `<div class="row"><span>ডেলিভারি চার্জ</span><span>+${money(sale.shipping)}</span></div>` : ""}
      <div class="row bold" style="font-size:${isThermal ? "13px" : "17px"}"><span>সর্বমোট</span><span>${money(sale.total)}</span></div>
      <div class="row"><span>পরিশোধ</span><span>${money(sale.paid)}</span></div>
      ${sale.due > 0 ? `<div class="row bold due"><span>বাকি</span><span>${money(sale.due)}</span></div>` : ""}
    </div>
    ${sale.payMethod ? `<div class="muted" style="margin-top:8px;">পেমেন্ট: ${sale.payMethod}${sale.senderNumber ? ` • প্রেরক: ${sale.senderNumber}` : ""}${sale.txnNo ? ` • ট্রানজেকশন: ${sale.txnNo}` : ""}</div>` : ""}
    <div class="muted center" style="margin-top:16px;">ধন্যবাদ, আবার আসবেন</div>
    <div class="btnbar"><button onclick="window.print()">🖨 প্রিন্ট করুন</button></div>
    <script>window.onload = function(){ try{ setTimeout(function(){ window.print(); }, 350);}catch(e){} };</script>
  </body></html>`;
}
function htmlToDataUrl(html) {
  return "data:text/html;charset=utf-8," + encodeURIComponent(html);
}
// পেজ ছেড়ে নতুন ট্যাবে না গিয়েই সরাসরি প্রিন্ট করার জন্য — একটা লুকানো iframe-এ HTML বসিয়ে
// দেওয়া হয়, আর সেই HTML-এর ভেতরের স্ক্রিপ্টই (buildInvoiceHTML/buildLabelHTML দ্রষ্টব্য) লোড হওয়ার পর প্রিন্ট ডায়ালগ খুলে দেয়।
function printHtml(html) {
  try {
    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0", opacity: "0" });
    document.body.appendChild(iframe);
    const cleanup = () => setTimeout(() => { if (iframe.parentNode) iframe.parentNode.removeChild(iframe); }, 60000);
    iframe.onload = cleanup;
    const doc = iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();
  } catch (e) {
    console.error("প্রিন্ট করা যায়নি:", e);
  }
}

function InvoiceModal({ sale, shopName, shopPhone, shopBin = "", invoiceFormat = "a4", onClose }) {
  const html = useMemo(() => buildInvoiceHTML(sale, shopName, shopPhone, shopBin, invoiceFormat), [sale, shopName, shopPhone, shopBin, invoiceFormat]);
  const dataUrl = useMemo(() => htmlToDataUrl(html), [html]);
  useEffect(() => { printHtml(html); }, [sale.id]); // বিক্রয় শেষ হওয়ার সাথে সাথেই অটো প্রিন্ট ডায়ালগ খোলে
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(33,38,31,0.55)" }}>
      <div className="w-full max-w-md" style={{ background: "#fff", color: "#111", fontFamily: "var(--font-body)" }}>
        <div className="p-6">
          <div className="text-center mb-4" style={{ borderBottom: "2px dashed #999", paddingBottom: 12 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22 }}>{shopName}</div>
            {shopPhone && <div className="text-xs" style={{ color: "#555" }}>{shopPhone}</div>}
            <div className="text-xs mt-1" style={{ color: "#555" }}>ইনভয়েস #{sale.invoiceNo} • {bnDateTime(sale.createdAt)}</div>
          </div>
          <div className="text-sm mb-3">
            <div><b>ক্রেতা:</b> {sale.customerName}</div>
            {sale.customerPhone && <div><b>ফোন:</b> {sale.customerPhone}</div>}
            {sale.prescriptionRef && <div><b>Rx রেফারেন্স:</b> {sale.prescriptionRef}</div>}
          </div>
          <table className="w-full text-sm mb-3" style={{ borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid #999" }}><th className="text-left py-1">পণ্য</th><th className="text-center py-1">পরিমাণ</th><th className="text-right py-1">দাম</th><th className="text-right py-1">মোট</th></tr></thead>
            <tbody>
              {sale.items.map((it, i) => (
                <tr key={i} style={{ borderBottom: "1px dotted #ccc" }}>
                  <td className="py-1">{it.name}</td><td className="text-center py-1">{it.qty} {it.unit}</td><td className="text-right py-1">{money(it.price)}</td><td className="text-right py-1">{money(it.qty * it.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-sm" style={{ borderTop: "2px dashed #999", paddingTop: 8 }}>
            {!!sale.discount && <div className="flex justify-between"><span>ছাড়</span><span>-{money(sale.discount)}</span></div>}
            {!!sale.tax && <div className="flex justify-between"><span>ভ্যাট/ট্যাক্স ({sale.taxRate}%)</span><span>+{money(sale.tax)}</span></div>}
            {!!sale.shipping && <div className="flex justify-between"><span>ডেলিভারি চার্জ</span><span>+{money(sale.shipping)}</span></div>}
            <div className="flex justify-between font-bold" style={{ fontSize: 16 }}><span>সর্বমোট</span><span>{money(sale.total)}</span></div>
            <div className="flex justify-between"><span>পরিশোধ</span><span>{money(sale.paid)}</span></div>
            {sale.due > 0 && <div className="flex justify-between font-bold" style={{ color: "#A93226" }}><span>বাকি</span><span>{money(sale.due)}</span></div>}
          </div>
          {sale.payMethod && (
            <div className="text-xs mt-2" style={{ color: "#666" }}>
              পেমেন্ট: {sale.payMethod}{sale.senderNumber ? ` • প্রেরক: ${sale.senderNumber}` : ""}{sale.txnNo ? ` • ট্রানজেকশন: ${sale.txnNo}` : ""}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 p-4" style={{ borderTop: "1px solid #ddd" }}>
          <button onClick={() => printHtml(html)} className="ledger-btn ledger-btn-solid justify-center gap-2"><Printer size={16} /> আবার প্রিন্ট করুন</button>
          <a href={dataUrl} download={`invoice-${sale.invoiceNo}.html`} className="ledger-btn justify-center gap-2"><Download size={16} /> ডাউনলোড করুন</a>
        </div>
        <div className="px-4 pb-4">
          <button className="ledger-btn w-full justify-center" onClick={onClose}><X size={16} className="mr-1" /> বন্ধ করুন</button>
        </div>
        <div className="px-4 pb-4 text-xs text-center" style={{ color: "#888" }}>
          এই উইন্ডো খোলার সাথে সাথেই প্রিন্ট ডায়ালগ অটো খোলার চেষ্টা করে। প্রিন্ট ডায়ালগ না এলে &ldquo;আবার প্রিন্ট করুন&rdquo; চাপুন — ব্রাউজার পপ-আপ/প্রিন্ট পারমিশন ব্লক করে থাকলে একবার অনুমতি দিতে হতে পারে।
        </div>
      </div>
    </div>
  );
}

// ---------- সাপ্লায়ারকে দেওয়ার ক্রয় স্লিপ ----------
function buildPurchaseSlipHTML(purchase, shopName, shopPhone, shopBin = "", format = "a4") {
  const isThermal = format === "thermal58" || format === "thermal80";
  const widthMm = format === "thermal58" ? 58 : 80;
  const rows = purchase.items.map((it) => `
    <tr style="border-bottom:1px dotted #ccc">
      <td style="padding:${isThermal ? "2px 0" : "4px 0"}">${it.name}${it.batchNo ? ` <span style="color:#888;font-size:0.85em">(${it.batchNo})</span>` : ""}</td>
      <td style="padding:${isThermal ? "2px 0" : "4px 0"};text-align:center">${it.qty}${isThermal ? "" : ` ${it.unit}`}</td>
      <td style="padding:${isThermal ? "2px 0" : "4px 0"};text-align:right">${money(it.cost)}</td>
      <td style="padding:${isThermal ? "2px 0" : "4px 0"};text-align:right">${money(it.qty * it.cost)}</td>
    </tr>`).join("");
  const pageCss = isThermal
    ? `@page{size:${widthMm}mm auto;margin:2mm;} body{font-family:'Noto Sans Bengali','Nirmala UI',sans-serif;width:${widthMm - 4}mm;margin:0 auto;padding:0;font-size:11px;}`
    : `@page{size:auto;margin:12mm;} body{font-family:'Noto Sans Bengali','Nirmala UI',sans-serif;color:#111;max-width:420px;margin:24px auto;padding:0 16px;}`;
  return `<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8" />
    <title>ক্রয় স্লিপ ${purchase.refNo || ""}</title>
    <style>
      ${pageCss}
      table{width:100%;border-collapse:collapse;font-size:${isThermal ? "11px" : "14px"};}
      th{text-align:left;border-bottom:1px solid #999;padding-bottom:4px;font-size:${isThermal ? "10px" : "13px"};color:#555;}
      .center{text-align:center}.right{text-align:right}
      .head{text-align:center;border-bottom:2px dashed #999;padding-bottom:${isThermal ? "6px" : "12px"};margin-bottom:${isThermal ? "6px" : "12px"};}
      .shop{font-weight:900;font-size:${isThermal ? "16px" : "22px"};}
      .muted{color:#666;font-size:${isThermal ? "10px" : "12px"};}
      .totals{border-top:2px dashed #999;padding-top:8px;margin-top:8px;font-size:${isThermal ? "12px" : "15px"};}
      .row{display:flex;justify-content:space-between;margin:2px 0;}
      .bold{font-weight:700;} .due{color:#A93226;}
      .btnbar{text-align:center;margin-top:18px;}
      .btnbar button{font-family:inherit;font-size:14px;font-weight:700;padding:8px 18px;border:1.5px solid #111;background:#2E6DE0;color:#fff;cursor:pointer;}
      @media print { .btnbar{display:none;} body{margin:0;} }
    </style></head>
  <body>
    <div class="head">
      <div class="shop">${shopName}</div>
      ${shopPhone ? `<div class="muted">${shopPhone}</div>` : ""}
      ${shopBin ? `<div class="muted">BIN: ${shopBin}</div>` : ""}
      <div class="muted" style="font-weight:700;margin-top:4px;">— ক্রয় স্লিপ (Purchase Slip) —</div>
      <div class="muted">${purchase.refNo ? `রেফ #${purchase.refNo} • ` : ""}${bnDateTime(purchase.createdAt)}</div>
    </div>
    <div style="font-size:${isThermal ? "11px" : "14px"};margin-bottom:${isThermal ? "6px" : "10px"};">
      <div><b>সাপ্লায়ার:</b> ${purchase.supplierName}</div>
      <div><b>ক্রয়কারী:</b> ${purchase.purchasedBy || "-"}</div>
    </div>
    <table>
      <thead><tr><th>পণ্য</th><th class="center">পরিমাণ</th><th class="right">দর</th><th class="right">মোট</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="row"><span>সাবটোটাল</span><span>${money(purchase.subtotal)}</span></div>
      ${purchase.extra ? `<div class="row"><span>অতিরিক্ত চার্জ</span><span>+${money(purchase.extra)}</span></div>` : ""}
      <div class="row bold" style="font-size:${isThermal ? "13px" : "17px"}"><span>সর্বমোট</span><span>${money(purchase.total)}</span></div>
      <div class="row"><span>পরিশোধ</span><span>${money(purchase.paid)}</span></div>
      ${purchase.due > 0 ? `<div class="row bold due"><span>বাকি</span><span>${money(purchase.due)}</span></div>` : ""}
    </div>
    ${purchase.payMethod ? `<div class="muted" style="margin-top:8px;">পেমেন্ট: ${purchase.payMethod}${purchase.senderNumber ? ` • প্রেরক: ${purchase.senderNumber}` : ""}${purchase.txnNo ? ` • ট্রানজেকশন: ${purchase.txnNo}` : ""}</div>` : ""}
    <div class="muted center" style="margin-top:16px;">ধন্যবাদ</div>
    <div class="btnbar"><button onclick="window.print()">🖨 প্রিন্ট করুন</button></div>
    <script>window.onload = function(){ try{ setTimeout(function(){ window.print(); }, 350);}catch(e){} };</script>
  </body></html>`;
}
function PurchaseSlipModal({ purchase, shopName, shopPhone, shopBin = "", invoiceFormat = "a4", onClose }) {
  const html = useMemo(() => buildPurchaseSlipHTML(purchase, shopName, shopPhone, shopBin, invoiceFormat), [purchase, shopName, shopPhone, shopBin, invoiceFormat]);
  const dataUrl = useMemo(() => htmlToDataUrl(html), [html]);
  useEffect(() => { printHtml(html); }, [purchase.id]); // ক্রয় সম্পন্ন হওয়ার সাথে সাথেই অটো প্রিন্ট ডায়ালগ খোলে
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(33,38,31,0.55)" }}>
      <div className="w-full max-w-md" style={{ background: "#fff", color: "#111", fontFamily: "var(--font-body)" }}>
        <div className="p-6">
          <div className="text-center mb-4" style={{ borderBottom: "2px dashed #999", paddingBottom: 12 }}>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22 }}>{shopName}</div>
            {shopPhone && <div className="text-xs" style={{ color: "#555" }}>{shopPhone}</div>}
            <div className="text-xs mt-1 font-bold">— ক্রয় স্লিপ —</div>
            <div className="text-xs" style={{ color: "#555" }}>{purchase.refNo ? `রেফ #${purchase.refNo} • ` : ""}{bnDateTime(purchase.createdAt)}</div>
          </div>
          <div className="text-sm mb-3">
            <div><b>সাপ্লায়ার:</b> {purchase.supplierName}</div>
          </div>
          <table className="w-full text-sm mb-3" style={{ borderCollapse: "collapse" }}>
            <thead><tr style={{ borderBottom: "1px solid #999" }}><th className="text-left py-1">পণ্য</th><th className="text-center py-1">পরিমাণ</th><th className="text-right py-1">দর</th><th className="text-right py-1">মোট</th></tr></thead>
            <tbody>
              {purchase.items.map((it, i) => (
                <tr key={i} style={{ borderBottom: "1px dotted #ccc" }}>
                  <td className="py-1">{it.name}</td><td className="text-center py-1">{it.qty} {it.unit}</td><td className="text-right py-1">{money(it.cost)}</td><td className="text-right py-1">{money(it.qty * it.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="text-sm" style={{ borderTop: "2px dashed #999", paddingTop: 8 }}>
            {!!purchase.extra && <div className="flex justify-between"><span>অতিরিক্ত চার্জ</span><span>+{money(purchase.extra)}</span></div>}
            <div className="flex justify-between font-bold" style={{ fontSize: 16 }}><span>সর্বমোট</span><span>{money(purchase.total)}</span></div>
            <div className="flex justify-between"><span>পরিশোধ</span><span>{money(purchase.paid)}</span></div>
            {purchase.due > 0 && <div className="flex justify-between font-bold" style={{ color: "#A93226" }}><span>বাকি</span><span>{money(purchase.due)}</span></div>}
          </div>
          {purchase.payMethod && (
            <div className="text-xs mt-2" style={{ color: "#666" }}>
              পেমেন্ট: {purchase.payMethod}{purchase.senderNumber ? ` • প্রেরক: ${purchase.senderNumber}` : ""}{purchase.txnNo ? ` • ট্রানজেকশন: ${purchase.txnNo}` : ""}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 p-4" style={{ borderTop: "1px solid #ddd" }}>
          <button onClick={() => printHtml(html)} className="ledger-btn ledger-btn-solid justify-center gap-2"><Printer size={16} /> আবার প্রিন্ট করুন</button>
          <a href={dataUrl} download={`purchase-slip-${purchase.refNo || purchase.id}.html`} className="ledger-btn justify-center gap-2"><Download size={16} /> ডাউনলোড করুন</a>
        </div>
        <div className="px-4 pb-4">
          <button className="ledger-btn w-full justify-center" onClick={onClose}><X size={16} className="mr-1" /> বন্ধ করুন</button>
        </div>
      </div>
    </div>
  );
}

// ---------- বারকোড লেবেল প্রিন্ট ----------
const LABEL_SIZES = {
  small: { w: 38, h: 22, label: "ছোট (৩৮×২২ মিমি)" },
  medium: { w: 50, h: 30, label: "মাঝারি (৫০×৩০ মিমি)" },
  large: { w: 60, h: 40, label: "বড় (৬০×৪০ মিমি)" },
};

function buildLabelHTML({ product, shopName, copies, showPrice, showShopName, sizeMm }) {
  const code = labelCodeFor(product);
  const n = Math.max(1, Math.min(200, Number(copies) || 1));
  const oneLabel = `
    <div class="label">
      ${showShopName && shopName ? `<div class="shop">${escapeHtml(shopName)}</div>` : ""}
      <div class="pname">${escapeHtml(product.name)}</div>
      <svg class="bcode" jsbarcode-value="${escapeHtml(code)}"></svg>
      <div class="code-text">${escapeHtml(code)}</div>
      ${showPrice ? `<div class="price">${money(product.sellPrice)}</div>` : ""}
    </div>`;
  const labels = Array.from({ length: n }).map(() => oneLabel).join("");
  return `<!doctype html><html><head><meta charset="utf-8" />
    <title>বারকোড লেবেল — ${escapeHtml(product.name)}</title>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/JsBarcode/3.11.5/JsBarcode.all.min.js"></script>
    <style>
      @page { margin: 4mm; }
      * { box-sizing: border-box; }
      body{ font-family: Arial, "Noto Sans Bengali", sans-serif; margin:0; background:#eee; }
      .sheet{ display:flex; flex-wrap:wrap; gap:2mm; padding:4mm; }
      .label{
        width:${sizeMm.w}mm; height:${sizeMm.h}mm; background:#fff;
        border:1px dashed #999; display:flex; flex-direction:column; align-items:center;
        justify-content:center; text-align:center; padding:1mm; overflow:hidden; page-break-inside:avoid;
      }
      .shop{ font-size:2.6mm; font-weight:700; line-height:1.1; }
      .pname{ font-size:2.9mm; font-weight:700; line-height:1.15; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%; }
      .code-text{ font-size:2.3mm; letter-spacing:0.3mm; margin-top:0.3mm; }
      .price{ font-size:3.4mm; font-weight:900; margin-top:0.4mm; }
      .bcode{ width:92%; height:auto; margin-top:0.5mm; }
      .btnbar{ text-align:center; margin:16px; }
      .btnbar button{ font-family:inherit; font-size:14px; font-weight:700; padding:8px 18px; border:1.5px solid #111; background:#A93226; color:#fff; cursor:pointer; }
      @media print { body{ background:#fff; } .btnbar{ display:none; } .label{ border:none; } }
    </style></head>
  <body>
    <div class="sheet">${labels}</div>
    <div class="btnbar"><button onclick="window.print()">🖨 প্রিন্ট করুন</button></div>
    <script>
      window.onload = function () {
        try {
          document.querySelectorAll('svg.bcode').forEach(function (svg) {
            JsBarcode(svg, svg.getAttribute('jsbarcode-value'), { format: "CODE128", displayValue: false, margin: 0, height: 38 });
          });
        } catch (e) { /* barcode lib লোড না হলেও কোড লেখাটা লেবেলে থেকেই যাবে */ }
        try { setTimeout(function () { window.print(); }, 450); } catch (e) {}
      };
    </script>
  </body></html>`;
}

function LabelModal({ product, shopName, onClose }) {
  const [copies, setCopies] = useState(String(Math.max(1, Math.min(50, product.stock || 1))));
  const [showPrice, setShowPrice] = useState(true);
  const [showShopName, setShowShopName] = useState(true);
  const [size, setSize] = useState("medium");
  const code = labelCodeFor(product);
  const hasRealCode = !!((product.barcode && product.barcode.trim()) || (product.sku && product.sku.trim()));

  const html = useMemo(
    () => buildLabelHTML({ product, shopName, copies, showPrice, showShopName, sizeMm: LABEL_SIZES[size] }),
    [product, shopName, copies, showPrice, showShopName, size]
  );
  const dataUrl = useMemo(() => htmlToDataUrl(html), [html]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(33,38,31,0.55)" }}>
      <div className="w-full max-w-sm" style={{ background: "#fff", color: "#111", fontFamily: "var(--font-body)" }}>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4"><Barcode size={20} /><div style={{ fontWeight: 900, fontSize: 18 }}>বারকোড লেবেল প্রিন্ট</div></div>
          <div className="text-sm mb-4" style={{ color: "#555" }}>
            <div style={{ fontWeight: 700 }}>{product.name}</div>
            <div className="text-xs mt-1">কোড: <span style={{ fontFamily: "monospace" }}>{code}</span></div>
            {!hasRealCode && (
              <div className="text-xs mt-1" style={{ color: "#A93226" }}>এই পণ্যে বারকোড/SKU সেট করা নেই — তাই আইডি দিয়ে অস্থায়ী কোড বানানো হয়েছে। স্থায়ীভাবে ব্যবহার করতে চাইলে পণ্য এডিট করে একটা বারকোড/SKU বসিয়ে দিন।</div>
            )}
          </div>
          <div className="flex flex-col gap-3 mb-2">
            <div>
              <label className="text-xs block mb-1" style={{ color: "#666" }}>কতগুলো লেবেল প্রিন্ট করবেন</label>
              <input type="number" min="1" max="200" className="field" value={copies} onChange={(e) => setCopies(e.target.value)} />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: "#666" }}>লেবেলের সাইজ</label>
              <select className="field" value={size} onChange={(e) => setSize(e.target.value)}>
                {Object.entries(LABEL_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showPrice} onChange={(e) => setShowPrice(e.target.checked)} /> লেবেলে দাম দেখাও</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showShopName} onChange={(e) => setShowShopName(e.target.checked)} /> দোকানের নাম দেখাও</label>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4" style={{ borderTop: "1px solid #ddd" }}>
          <button onClick={() => printHtml(html)} className="ledger-btn ledger-btn-solid justify-center gap-2"><Printer size={16} /> প্রিন্ট করুন</button>
          <a href={dataUrl} download={`label-${(product.sku || product.name || "product").toString().replace(/[^a-zA-Z0-9-_]+/g, "-")}.html`} className="ledger-btn justify-center gap-2"><Download size={16} /> ডাউনলোড করুন</a>
        </div>
        <div className="px-4 pb-4"><button className="ledger-btn w-full justify-center" onClick={onClose}><X size={16} className="mr-1" /> বন্ধ করুন</button></div>
        <div className="px-4 pb-4 text-xs text-center" style={{ color: "#888" }}>
          &ldquo;প্রিন্ট করুন&rdquo; চাপলে সরাসরি প্রিন্ট ডায়ালগ খুলবে — নতুন ট্যাবে যেতে হবে না।
        </div>
      </div>
    </div>
  );
}

// ---------- pickers ----------
function ProductPicker({ products, onPick, placeholder, autoFocusScan = false, allowCameraScan = false }) {
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { if (autoFocusScan) inputRef.current?.focus(); }, [autoFocusScan]);
  const results = useMemo(() => {
    if (!q.trim()) return products.slice(0, 6);
    const s = q.toLowerCase().trim();
    return products.filter((p) => p.name.toLowerCase().includes(s) || (p.sku || "").toLowerCase().includes(s) || (p.barcode || "").toLowerCase().includes(s)).slice(0, 8);
  }, [q, products]);
  function refocus() { if (autoFocusScan) setTimeout(() => inputRef.current?.focus(), 20); }
  // বারকোড স্ক্যানার (কীবোর্ড বা ক্যামেরা, দুই ক্ষেত্রেই) থেকে আসা কোড এখানে মেলানো হয়
  function tryPick(codeRaw) {
    const s = (codeRaw || "").toLowerCase().trim();
    if (!s) return false;
    const exact = products.find((p) => (p.barcode || "").toLowerCase() === s || (p.sku || "").toLowerCase() === s || String(p.id).toLowerCase() === s);
    if (exact) { onPick(exact); return true; }
    return false;
  }
  function handleKeyDown(e) {
    if (e.key !== "Enter") return;
    const s = q.trim();
    if (!s) return;
    // বারকোড স্ক্যানার সাধারণত পুরো কোড টাইপ করে Enter চাপে — সরাসরি মিলে গেলে অটো-যোগ করা হয়
    if (tryPick(s)) { setQ(""); setOpen(false); if (autoFocusScan) playSuccessSound(); refocus(); return; }
    if (results.length === 1) { onPick(results[0]); setQ(""); setOpen(false); refocus(); return; }
    // স্ক্যান মোডে কোনো মিল না পেলে ভুল/অজানা বারকোড ধরে নিয়ে সতর্ক করা হয়
    if (autoFocusScan) { playErrorSound(); }
  }
  function handleCameraDetect(code) {
    setCameraOpen(false);
    if (tryPick(code)) { playSuccessSound(); refocus(); }
    else { setQ(code); setOpen(true); playErrorSound(); }
  }
  return (
    <div className="relative">
      <div className="flex items-center gap-2 border-2 px-3 py-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        <Barcode size={16} style={{ color: "var(--ink-faint)" }} />
        <input ref={inputRef} className="field" style={{ borderBottom: "none" }} placeholder={placeholder || "নাম, SKU বা বারকোড দিয়ে খুঁজুন / স্ক্যান করুন…"} value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={handleKeyDown} />
        {allowCameraScan && (
          <button type="button" title="ক্যামেরা দিয়ে স্ক্যান করুন" onClick={() => setCameraOpen(true)} style={{ color: "var(--tab-navy)" }}><Camera size={18} /></button>
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-20 w-full border-2 mt-1 max-h-64 overflow-auto" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          {results.map((p) => (
            <button key={p.id} className="w-full text-left px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid var(--rule-blue)" }}
              onClick={() => { onPick(p); setQ(""); setOpen(false); refocus(); }}>
              <span>{p.name} {p.sku && <span className="text-xs" style={{ color: "var(--ink-faint)" }}>({p.sku})</span>}</span>
              <span className="text-xs" style={{ color: p.stock <= 0 ? "var(--stamp)" : "var(--ink-faint)" }}>স্টক: {p.stock} {p.unit}</span>
            </button>
          ))}
        </div>
      )}
      {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}
      {cameraOpen && <CameraScanModal onClose={() => setCameraOpen(false)} onDetect={handleCameraDetect} />}
    </div>
  );
}

// ---------- ক্যামেরা দিয়ে বারকোড স্ক্যান ----------
// ব্রাউজারের বিল্ট-ইন BarcodeDetector API ব্যবহার করা হয় (কোনো এক্সটার্নাল লাইব্রেরি লাগে না)।
// Chrome/Edge/Android-এ কাজ করে; যেসব ব্রাউজারে সাপোর্ট নেই (যেমন Safari), সেখানে ম্যানুয়াল কোড-এন্ট্রি ফলব্যাক দেখানো হয়।
function CameraScanModal({ onClose, onDetect }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const rafRef = useRef(null);
  const [error, setError] = useState("");
  const [manual, setManual] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (typeof window === "undefined" || !("BarcodeDetector" in window)) {
        setError("আপনার ব্রাউজারে সরাসরি ক্যামেরা-স্ক্যান সাপোর্ট নেই (Android-এ Chrome ব্যবহার করে দেখুন)। নিচে কোড টাইপ করে যোগ করুন।");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
        const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "code_128", "upc_a", "upc_e", "code_39", "qr_code"] });
        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes && codes.length) { onDetect(codes[0].rawValue); return; }
          } catch (e) { /* ফ্রেম রেডি না থাকলে স্কিপ করা হয় */ }
          rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
      } catch (e) {
        setError("ক্যামেরা চালু করা যায়নি — পারমিশন দিয়েছেন কিনা দেখুন, অথবা নিচে কোড টাইপ করুন।");
      }
    }
    start();
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, [onDetect]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)" }}>
      <div className="w-full max-w-sm" style={{ background: "#fff", color: "#111" }}>
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2" style={{ fontWeight: 700 }}><Camera size={18} /> ক্যামেরা দিয়ে বারকোড স্ক্যান</div>
            <button onClick={onClose}><X size={18} /></button>
          </div>
          {!error ? (
            <div style={{ position: "relative", background: "#000", aspectRatio: "4/3", overflow: "hidden" }}>
              <video ref={videoRef} muted playsInline style={{ width: "100%", height: "100%", objectFit: "cover" }} />
              <div className="pointer-events-none" style={{ position: "absolute", inset: "28% 8%", border: "2px solid #2E6DE0" }} />
            </div>
          ) : (
            <div className="text-sm mb-2" style={{ color: "#A93226" }}>{error}</div>
          )}
          <div className="mt-3 flex gap-2">
            <input autoFocus className="field" placeholder="অথবা কোড টাইপ/স্ক্যান করুন…" value={manual}
              onChange={(e) => setManual(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && manual.trim()) { onDetect(manual.trim()); setManual(""); } }} />
            <button className="ledger-btn ledger-btn-navy" onClick={() => { if (manual.trim()) { onDetect(manual.trim()); setManual(""); } }}>যোগ</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function PartyPicker({ parties, selected, onSelect, onCreateNew, label, placeholder }) {
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState(""); const [newPhone, setNewPhone] = useState("");
  const results = useMemo(() => {
    if (!q.trim()) return parties.slice(0, 6);
    return parties.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || (p.phone || "").includes(q)).slice(0, 8);
  }, [q, parties]);

  if (selected) {
    return (
      <div className="flex items-center gap-2 border-2 px-3 py-2 max-w-md" style={{ borderColor: "var(--gold)", background: "var(--paper)" }}>
        <UserRound size={16} style={{ color: "var(--gold)" }} />
        <div className="flex-1"><div style={{ fontWeight: 700 }}>{selected.name}</div>{selected.phone && <div className="text-xs" style={{ color: "var(--ink-faint)" }}>{selected.phone}</div>}</div>
        <button onClick={() => onSelect(null)}><X size={16} /></button>
      </div>
    );
  }
  return (
    <div className="relative max-w-md">
      {!creating ? (
        <>
          <div className="flex items-center gap-2 border-2 px-3 py-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
            <Search size={16} style={{ color: "var(--ink-faint)" }} />
            <input className="field" style={{ borderBottom: "none" }} placeholder={placeholder} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
          </div>
          {open && (
            <div className="absolute z-20 w-full border-2 mt-1 max-h-64 overflow-auto" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
              {results.map((p) => (
                <button key={p.id} className="w-full text-left px-3 py-2 flex items-center justify-between" style={{ borderBottom: "1px solid var(--rule-blue)" }} onClick={() => { onSelect(p); setQ(""); setOpen(false); }}>
                  <span>{p.name}</span><span className="text-xs" style={{ color: "var(--ink-faint)" }}>{p.phone}</span>
                </button>
              ))}
              <button className="w-full text-left px-3 py-2 flex items-center gap-2" style={{ color: "var(--gold)", fontWeight: 700 }} onClick={() => { setCreating(true); setOpen(false); setNewName(q); }}>
                <Plus size={14} /> নতুন {label} যোগ করুন
              </button>
            </div>
          )}
          {open && <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />}
        </>
      ) : (
        <div className="border-2 p-3 flex flex-col gap-2" style={{ borderColor: "var(--gold)", background: "var(--paper)" }}>
          <input className="field" placeholder={`${label}র নাম`} value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus />
          <input className="field" placeholder="ফোন নম্বর (ঐচ্ছিক)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          <div className="flex gap-2">
            <button className="ledger-btn ledger-btn-navy flex-1" onClick={() => {
              if (!newName.trim()) return;
              const p = { id: uid(), name: newName.trim(), phone: newPhone.trim(), address: "", openingBalance: 0, createdAt: Date.now() };
              onCreateNew(p); onSelect(p); setCreating(false); setNewName(""); setNewPhone("");
            }}>যোগ করুন</button>
            <button className="ledger-btn" onClick={() => setCreating(false)}>বাতিল</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({ products, sales, purchases, customers, suppliers, payments, expenses, setTab, onPrint, isOwner = false }) {
  const today = todayStr();
  const todaySales = sales.filter((s) => s.date === today);
  const todayTotal = todaySales.reduce((a, s) => a + s.total, 0);
  const totalSales = sales.reduce((a, s) => a + s.total, 0);
  const totalPurchase = purchases.reduce((a, p) => a + p.total, 0);
  const totalExpense = expenses.reduce((a, e) => a + e.amount, 0);
  const netEstimate = totalSales - totalPurchase - totalExpense;
  const invoiceDue = sales.reduce((a, s) => a + (s.due || 0), 0);
  const purchaseDueTotal = purchases.reduce((a, p) => a + (p.due || 0), 0);
  const stockValue = products.reduce((a, p) => a + p.stock * p.sellPrice, 0);
  const lowStock = products.filter((p) => p.stock <= (p.lowStockAt ?? 5));
  const expiring = products.filter((p) => p.expiry && daysBetween(p.expiry) <= 60).sort((a, b) => a.expiry.localeCompare(b.expiry));
  const totalReceivable = customers.reduce((a, c) => a + customerDue(c.id, sales, payments, customers), 0);
  const totalPayable = suppliers.reduce((a, s) => a + supplierDue(s.id, purchases, payments, suppliers), 0);

  const salesDue = sales.filter((s) => s.due > 0).sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  const purchDue = purchases.filter((p) => p.due > 0).sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);

  const byDay = {};
  const start = new Date(); start.setDate(start.getDate() - 29);
  for (let i = 0; i < 30; i++) { const d = new Date(start); d.setDate(d.getDate() + i); byDay[d.toISOString().slice(0, 10)] = 0; }
  sales.forEach((s) => { if (byDay[s.date] !== undefined) byDay[s.date] += s.total; });
  const chartData = Object.entries(byDay).map(([date, total]) => ({ date: date.slice(5), total }));

  return (
    <div>
      <SectionTitle icon={LayoutGrid} right={isOwner && <button className="ledger-btn ledger-btn-sm flex items-center gap-1" onClick={() => setTab("activityLog")}><History size={14} /> অ্যাক্টিভিটি লগ দেখুন</button>}>হোম — মূল পরিসংখ্যান</SectionTitle>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
        <StatCard label="মোট বিক্রয়" value={money(totalSales)} icon={TrendingUp} tone="green" />
        <StatCard label="আনুমানিক নেট" value={money(netEstimate)} icon={Wallet} tone={netEstimate >= 0 ? "gold" : "red"} />
        <StatCard label="ইনভয়েস বাকি" value={money(invoiceDue)} icon={Receipt} tone={invoiceDue ? "red" : "ink"} onClick={() => setTab("customers")} />
        <StatCard label="আজকের বিক্রয়" value={money(todayTotal)} icon={Clock} tone="green" />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="মোট ক্রয়" value={money(totalPurchase)} icon={PackagePlus} />
        <StatCard label="ক্রয় বাকি" value={money(purchaseDueTotal)} icon={AlertTriangle} tone={purchaseDueTotal ? "red" : "ink"} onClick={() => setTab("suppliers")} />
        <StatCard label="মোট খরচ" value={money(totalExpense)} icon={Wallet} tone="red" onClick={() => setTab("expenses")} />
        <StatCard label="স্টক মূল্য" value={money(stockValue)} icon={Boxes} tone="gold" onClick={() => setTab("stock")} />
      </div>

      {chartData.some((d) => d.total > 0) && (
        <div className="border-2 p-4 mb-8" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          <div className="mb-3 font-bold flex items-center gap-2" style={{ color: "var(--ink)" }}><TrendingUp size={16} /> গত ৩০ দিনের বিক্রয়</div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-blue)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval={4} /><YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => money(v)} /><Line type="monotone" dataKey="total" stroke="#A93226" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <div>
          <SectionTitle icon={UserRound}>কাস্টমারের বাকি</SectionTitle>
          <div className="border-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
            {salesDue.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--ink-faint)" }}>কোনো বাকি নেই।</div>}
            {salesDue.map((s, i) => (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
                <div><div style={{ fontWeight: 600 }}>{s.customerName}</div><div className="text-xs" style={{ color: "var(--ink-faint)" }}>#{s.invoiceNo}</div></div>
                <div className="flex items-center gap-2"><span style={{ color: "var(--stamp)", fontWeight: 700 }}>{money(s.due)}</span><button className="ledger-btn ledger-btn-sm" onClick={() => onPrint(s)}><Printer size={13} /></button></div>
              </div>
            ))}
          </div>
        </div>
        <div>
          <SectionTitle icon={Truck}>সাপ্লায়ারের দেনা</SectionTitle>
          <div className="border-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
            {purchDue.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--ink-faint)" }}>কোনো দেনা নেই।</div>}
            {purchDue.map((p, i) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
                <div><div style={{ fontWeight: 600 }}>{p.supplierName}</div><div className="text-xs" style={{ color: "var(--ink-faint)" }}>{p.refNo || "-"}</div></div>
                <span style={{ color: "var(--stamp)", fontWeight: 700 }}>{money(p.due)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4 mb-4">
        {lowStock.length > 0 && (
          <div>
            <SectionTitle icon={PackageSearch} right={
              <a className="ledger-btn ledger-btn-sm flex items-center gap-1" style={{ borderColor: "#25D366", color: "#128C4A" }}
                href={waShareLink(`স্টক অ্যালার্ট (${bnDate(todayStr())}):\n` + lowStock.map((p) => `• ${p.name} — মাত্র ${p.stock} ${p.unit}`).join("\n"))}
                target="_blank" rel="noopener noreferrer"><MessageCircle size={13} /> WhatsApp-এ শেয়ার</a>
            }>স্টক শেষের পথে</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {lowStock.map((p) => <div key={p.id} className="px-3 py-2 text-sm" style={{ background: "#FFFFFF", borderLeft: "4px solid var(--tab-navy)", color: "var(--ink)" }}>{p.name} — মাত্র {p.stock} {p.unit}</div>)}
            </div>
          </div>
        )}
        {expiring.length > 0 && (
          <div>
            <SectionTitle icon={Clock} right={
              <a className="ledger-btn ledger-btn-sm flex items-center gap-1" style={{ borderColor: "#25D366", color: "#128C4A" }}
                href={waShareLink(`মেয়াদ উত্তীর্ণ সতর্কতা (${bnDate(todayStr())}):\n` + expiring.map((p) => `• ${p.name} — ${daysBetween(p.expiry) < 0 ? "মেয়াদ শেষ" : `${daysBetween(p.expiry)} দিনে শেষ`}`).join("\n"))}
                target="_blank" rel="noopener noreferrer"><MessageCircle size={13} /> WhatsApp-এ শেয়ার</a>
            }>মেয়াদ উত্তীর্ণ সতর্কতা</SectionTitle>
            <div className="flex flex-wrap gap-2">
              {expiring.map((p) => {
                const d = daysBetween(p.expiry);
                return <div key={p.id} className="border-2 px-3 py-2 text-sm" style={{ borderColor: d < 0 ? "var(--stamp)" : "var(--gold)", color: d < 0 ? "var(--stamp)" : "#8a6a10" }}>{p.name} — {d < 0 ? "মেয়াদ শেষ" : `${d} দিনে শেষ`}</div>;
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Sales tab ----------
function SalesTab({ products, setProducts, sales, setSales, returns, setReturns, customers, setCustomers, payments, currentUser, pushToast, onPrint, shopTaxRate = 0, shopMfsNumber = "", logActivity = () => {}, isOwner = false, employees = [], discountPinLimit = 15, shifts = [], currentShiftId = null, parkedSales = [], setParkedSales = () => {} }) {
  const [view, setView] = useState("new");
  const [cart, setCart] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [paidInput, setPaidInput] = useState("");
  const [discount, setDiscount] = useState("");
  const [shipping, setShipping] = useState("");
  const [taxRateInput, setTaxRateInput] = useState(String(shopTaxRate || 0));
  const [payMethod, setPayMethod] = useState("ক্যাশ");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [secondPayMethod, setSecondPayMethod] = useState("বিকাশ");
  const [secondPaid, setSecondPaid] = useState("");
  const [loyaltyRedeem, setLoyaltyRedeem] = useState("");
  const [txnNo, setTxnNo] = useState("");
  const [bankAccNo, setBankAccNo] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [prescriptionRef, setPrescriptionRef] = useState("");
  const [controlledInfo, setControlledInfo] = useState({ name: "", address: "", prescriptionNo: "", patientAge: "", doctorName: "", doctorRegNo: "" });
  const [prescriptionImage, setPrescriptionImage] = useState("");
  const [pinPrompt, setPinPrompt] = useState(false); // বড় ছাড়ে মালিকের PIN চাওয়ার মডাল খোলা আছে কিনা
  const [pinInput, setPinInput] = useState("");
  const [pinError, setPinError] = useState("");
  const [pinApprovedBy, setPinApprovedBy] = useState(null); // এই চেকআউটটা কোন মালিকের PIN দিয়ে অনুমোদিত হয়েছে
  const { needsTxn, needsBankAcc, needsSenderNumber, isMobileBanking } = payMethodFlags(payMethod);
  const hasRxItem = cart.some((i) => i.requiresRx);
  const hasControlledItem = cart.some((i) => i.isControlled);
  const allergyMatches = customer?.allergies ? cart.filter((i) => (i.allergyTags || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).some((tag) => customer.allergies.toLowerCase().includes(tag))) : [];
  const interactionItems = cart.filter((i) => i.interactionTags);
  const alternatives = cart.flatMap((i) => { const p = products.find((x) => x.id === i.productId); return p?.genericName ? products.filter((x) => x.id !== p.id && x.genericName && x.genericName.toLowerCase() === p.genericName.toLowerCase() && x.stock > 0).slice(0, 3).map((x) => ({ source: p.name, product: x })) : []; });

  function addToCart(p) {
    setCart((c) => { const ex = c.find((i) => i.productId === p.id); if (ex) return c.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + 1 } : i)); return [...c, { productId: p.id, name: p.name, unit: p.unit, qty: 1, price: (customer?.group === "Wholesale" && p.wholesalePrice) ? p.wholesalePrice : p.sellPrice, stock: p.stock, requiresRx: !!p.requiresRx, isControlled: !!p.isControlled, isAntibiotic: !!p.isAntibiotic, isHighAlert: !!p.isHighAlert, favorite: !!p.favorite, allergyTags: p.allergyTags || "", interactionTags: p.interactionTags || "", manufacturer: p.manufacturer || "", dosageForm: p.dosageForm || "", storageInstruction: p.storageInstruction || "", rack: p.rack || "", reorderLevel: p.reorderLevel ?? 5, maxStock: p.maxStock || "", unitOptions: p.unitOptions || [], saleUnit: p.unit, factor: 1 }]; });
  }
  function updateLine(id, patch) { setCart((c) => c.map((i) => (i.productId === id ? { ...i, ...patch } : i))); }
  function removeLine(id) { setCart((c) => c.filter((i) => i.productId !== id)); }
  const subtotal = cart.reduce((a, i) => a + i.qty * i.price, 0);
  const disc = Math.max(0, Number(discount) || 0);
  const ship = Math.max(0, Number(shipping) || 0);
  const taxRate = Math.max(0, Math.min(100, Number(taxRateInput) || 0));
  const tax = Math.max(0, subtotal - disc) * (taxRate / 100);
  const availablePoints = customer ? Math.floor(sales.filter((x) => x.customerId === customer.id && !x.cancelled).reduce((a, x) => a + x.total, 0) / 100) : 0;
  const loyaltyDiscount = Math.min(subtotal - disc, Math.max(0, Number(loyaltyRedeem) || 0));
  const total = Math.max(0, subtotal - disc - loyaltyDiscount + tax + ship);
  const overStock = cart.some((i) => i.qty * (Number(i.factor) || 1) > i.stock);
  const splitFirst = Math.max(0, Number(paidInput) || 0);
  const splitSecond = Math.max(0, Number(secondPaid) || 0);
  const paid = splitEnabled ? Math.min(total, splitFirst + splitSecond) : (paidInput === "" ? total : splitFirst);
  const due = Math.max(0, total - paid);
  const discPercent = subtotal > 0 ? (disc / subtotal) * 100 : 0;
  // কর্মচারী (মালিক নন) যদি থ্রেশহোল্ডের চেয়ে বেশি % ছাড় দেন, তাহলে চেকআউটের আগে মালিকের PIN লাগবে
  const needsOwnerApproval = !isOwner && disc > 0 && discPercent >= discountPinLimit && !pinApprovedBy;

  function verifyOwnerPin() {
    const owner = employees.find((e) => e.role === "owner" && (e.pin || "0000") === pinInput);
    if (owner) {
      setPinApprovedBy(owner.name); setPinPrompt(false); setPinInput(""); setPinError("");
      playSuccessSound();
      logActivity("discount_override", `${currentUser.name} — ${discPercent.toFixed(1)}% ছাড়ের জন্য ${owner.name} এর PIN দিয়ে অনুমোদন`);
    } else {
      setPinError("পিন মিলছে না"); playErrorSound();
    }
  }

  function attemptCheckout() {
    if (cart.length === 0) return;
    if (overStock) { pushToast("স্টকের চেয়ে বেশি পরিমাণ বিক্রি করা যাবে না — পরিমাণ কমান বা আগে স্টক আপডেট করুন", "warn"); return; }
    if (due > 0 && !customer) { pushToast("বাকি রাখতে হলে কাস্টমার বেছে নিন", "warn"); return; }
    if (allergyMatches.length) { pushToast(`অ্যালার্জি সতর্কতা: ${allergyMatches.map((x)=>x.name).join(", ")} — customer allergy profile যাচাই করুন`, "warn"); return; }
    if (interactionItems.length > 1) { pushToast("Drug interaction warning: একাধিক interaction tag আছে — pharmacist review করুন", "warn"); return; }
    if (hasControlledItem && (!controlledInfo.name.trim() || !controlledInfo.address.trim() || !controlledInfo.prescriptionNo.trim())) { pushToast("নিয়ন্ত্রিত ওষুধের জন্য নাম, ঠিকানা ও প্রেসক্রিপশন নম্বর বাধ্যতামূলক", "warn"); return; }
    const expired = cart.find((i) => { const p = products.find((x) => x.id === i.productId); return p?.expiry && daysBetween(p.expiry) < 0; });
    if (expired) { pushToast(`${expired.name} মেয়াদোত্তীর্ণ — বিক্রি বন্ধ`, "warn"); return; }
    if (needsOwnerApproval) { setPinInput(""); setPinError(""); setPinPrompt(true); return; }
    checkout();
  }

  function checkout() {
    if (cart.length === 0) return;
    if (overStock) { pushToast("স্টকের চেয়ে বেশি পরিমাণ বিক্রি করা যাবে না — পরিমাণ কমান বা আগে স্টক আপডেট করুন", "warn"); return; }
    if (due > 0 && !customer) { pushToast("বাকি রাখতে হলে কাস্টমার বেছে নিন", "warn"); return; }
    const nextInvoiceNo = sales.reduce((max, s) => Math.max(max, s.invoiceNo || 0), 0) + 1;
    const paymentBreakdown = splitEnabled ? [{ method: payMethod, amount: splitFirst }, { method: secondPayMethod, amount: splitSecond }] : [{ method: payMethod, amount: paid }];
    const sale = {
      id: uid(), invoiceNo: nextInvoiceNo, date: todayStr(), createdAt: Date.now(),
      items: cart.map((i) => ({ productId: i.productId, name: i.name, qty: i.qty, baseQty: i.qty * (Number(i.factor) || 1), price: i.price, unit: i.saleUnit || i.unit, baseUnit: i.unit })),
      subtotal, discount: disc, loyaltyRedeem: loyaltyDiscount, taxRate, tax, shipping: ship, total, paid, due, payMethod,
      paymentBreakdown,
      txnNo: needsTxn ? txnNo.trim() : "", bankAccNo: needsBankAcc ? bankAccNo.trim() : "",
      senderNumber: needsSenderNumber ? senderNumber.trim() : "",
      customerId: customer?.id || null, customerName: customer?.name || "সাধারণ ক্রেতা", customerPhone: customer?.phone || "",
      soldBy: currentUser.name, prescriptionRef: hasRxItem ? prescriptionRef.trim() : "",
      controlledRegister: hasControlledItem ? { ...controlledInfo, imageData: prescriptionImage || "", recordedAt: Date.now() } : null,
      shiftId: currentShiftId || null,
    };
    setSales((s) => [sale, ...s]);
    // ব্যাচ-ট্র্যাকিং করা পণ্যে মেয়াদ-অনুযায়ী আগে (FEFO) স্টক কমানো হয়, সাধারণ পণ্যে আগের মতোই সরাসরি স্টক কমে
    setProducts((prods) => prods.map((p) => {
      const line = cart.find((i) => i.productId === p.id);
      if (!line) return p;
      if (p.batches && p.batches.length) {
        let remaining = line.qty * (Number(line.factor) || 1);
        const sorted = [...p.batches].sort((a, b) => (a.expiry || "9999-99-99").localeCompare(b.expiry || "9999-99-99"));
        const newBatches = [];
        for (const b of sorted) {
          if (remaining <= 0) { newBatches.push(b); continue; }
          const take = Math.min(b.qty, remaining);
          remaining -= take;
          const leftQty = b.qty - take;
          if (leftQty > 0) newBatches.push({ ...b, qty: leftQty });
        }
        return syncStockFromBatches({ ...p, batches: newBatches });
      }
      return { ...p, stock: Math.max(0, p.stock - line.qty * (Number(line.factor) || 1)) };
    }));
    const nowLow = cart.filter((i) => {
      const prod = products.find((p) => p.id === i.productId);
      if (!prod) return false;
      const newStock = Math.max(0, prod.stock - i.qty);
      return newStock <= (prod.lowStockAt ?? 5);
    });
    setCart([]); setCustomer(null); setPaidInput(""); setSecondPaid(""); setSplitEnabled(false); setLoyaltyRedeem(""); setDiscount(""); setShipping(""); setTxnNo(""); setBankAccNo(""); setSenderNumber(""); setTaxRateInput(String(shopTaxRate || 0)); setPrescriptionRef(""); setControlledInfo({ name: "", address: "", prescriptionNo: "", patientAge: "", doctorName: "", doctorRegNo: "" }); setPrescriptionImage(""); setPinApprovedBy(null);
    pushToast("বিক্রয় সম্পন্ন হয়েছে ✓");
    logActivity("sale", `ইনভয়েস #${sale.invoiceNo} — ${sale.customerName} — মোট ${money(sale.total)}${disc > 0 ? ` (ছাড় ${money(disc)})` : ""}`, { refId: sale.id });
    if (nowLow.length > 0) {
      const names = nowLow.slice(0, 3).map((i) => i.name).join(", ");
      setTimeout(() => pushToast(`স্টক অ্যালার্ট: ${names}${nowLow.length > 3 ? " +আরও" : ""} — স্টক কমে গেছে`, "warn"), 2500);
    }
    onPrint(sale);
  }

  if (view === "list") {
    return <SalesList sales={sales} setSales={setSales} products={products} setProducts={setProducts} returns={returns} setReturns={setReturns} currentUser={currentUser} pushToast={pushToast} onBack={() => setView("new")} onPrint={onPrint} logActivity={logActivity} />;
  }

  return (
    <>
    <div>
      <SectionTitle icon={ShoppingCart} right={<div className="flex gap-2"><button className="ledger-btn ledger-btn-sm" onClick={() => { if (cart.length) { setParkedSales((v) => [{ id: uid(), createdAt: Date.now(), customer, cart, discount, shipping, payMethod }, ...v]); setCart([]); setCustomer(null); pushToast("সেল পার্ক করা হয়েছে ✓"); } }}>সেল পার্ক ({parkedSales.length})</button><button className="ledger-btn ledger-btn-sm flex items-center gap-1" onClick={() => setView("list")}><ListIcon size={14} /> সব বিক্রয়ের তালিকা</button></div>}>নতুন বিক্রয় (POS)</SectionTitle>
      {parkedSales.length > 0 && <div className="border-2 p-3 mb-4" style={{ borderColor:"var(--gold)", background:"var(--paper)" }}><b>Parked sales</b><div className="flex flex-wrap gap-2 mt-2">{parkedSales.map((h) => <button key={h.id} className="ledger-btn ledger-btn-sm" onClick={() => { setCart(h.cart); setCustomer(h.customer); setDiscount(h.discount); setShipping(h.shipping); setPayMethod(h.payMethod); setParkedSales((v)=>v.filter((x)=>x.id!==h.id)); }}>{h.cart.length} পণ্য • {bnDateTime(h.createdAt)}</button>)}</div></div>}

      {products.length === 0 ? <EmptyState text="আগে স্টক ট্যাব থেকে পণ্য যোগ করুন।" /> : (
        <>
          <div className="grid md:grid-cols-2 gap-4 mb-4">
            <div><label className="text-xs block mb-1" style={{ color: "var(--ink-faint)" }}>পণ্য যোগ করুন</label><ProductPicker products={products} onPick={addToCart} placeholder="নাম/SKU দিয়ে খুঁজুন, অথবা বারকোড স্ক্যান করুন…" autoFocusScan allowCameraScan /></div>
            {products.some((p)=>p.favorite) && <div className="md:col-span-2 flex flex-wrap gap-2"><span className="text-xs">Quick sale:</span>{products.filter((p)=>p.favorite).slice(0,12).map((p)=><button key={p.id} className="ledger-btn ledger-btn-sm" onClick={()=>addToCart(p)}>★ {p.name}</button>)}</div>}
            <div><label className="text-xs block mb-1" style={{ color: "var(--ink-faint)" }}>কাস্টমার (ঐচ্ছিক — বাকি রাখতে প্রয়োজন)</label><PartyPicker parties={customers} selected={customer} onSelect={setCustomer} onCreateNew={(p) => setCustomers((c) => [...c, p])} label="কাস্টমার" placeholder="কাস্টমারের নাম/নম্বর খুঁজুন…" /></div>
          </div>

          {cart.length === 0 ? <EmptyState text="এখনো কোনো পণ্য যোগ করা হয়নি। উপরে খুঁজে যোগ করুন।" /> : (
            <div className="border-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
              <div className="grid grid-cols-12 px-4 py-2 text-sm font-bold" style={{ borderBottom: "2px solid var(--ink)", color: "var(--ink-faint)" }}>
                <div className="col-span-5">পণ্য</div><div className="col-span-2 text-center">পরিমাণ</div><div className="col-span-2 text-right">দাম</div><div className="col-span-2 text-right">মোট</div><div className="col-span-1"></div>
              </div>
              {cart.map((i) => (
                <div key={i.productId} className="grid grid-cols-12 px-4 py-2.5 items-center" style={{ borderBottom: "1px solid var(--rule-blue)" }}>
                  <div className="col-span-5"><div style={{ fontWeight: 600 }} className="flex items-center gap-2">{i.name}{i.requiresRx && <span className="text-xs px-1.5 py-0.5 font-bold" style={{ background: "var(--tab-navy)", color: "#fff" }}>Rx</span>}{i.isControlled && <span className="text-xs px-1.5 py-0.5 font-bold" style={{ background: "var(--stamp)", color: "#fff" }}>নিয়ন্ত্রিত</span>}</div>{i.qty * (Number(i.factor) || 1) > i.stock && <div className="text-xs" style={{ color: "var(--stamp)" }}>স্টকে আছে মাত্র {i.stock} {i.unit}</div>}{i.unitOptions?.length > 0 && <select className="field text-xs" value={i.saleUnit || i.unit} onChange={(e) => { const u = e.target.value; const f = u === i.unit ? 1 : Number(i.unitOptions.find((x) => x.name === u)?.factor || 1); updateLine(i.productId, { saleUnit: u, factor: f }); }}><option value={i.unit}>{i.unit}</option>{i.unitOptions.map((u) => <option key={u.name} value={u.name}>{u.name} (১ = {u.factor} {i.unit})</option>)}</select>}</div>
                  <div className="col-span-2 flex items-center justify-center gap-1">
                    <button className="ledger-btn p-1" onClick={() => updateLine(i.productId, { qty: Math.max(1, i.qty - 1) })}><Minus size={12} /></button>
                    <input type="number" className="field text-center" style={{ width: 44 }} value={i.qty} onChange={(e) => updateLine(i.productId, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                    <button className="ledger-btn p-1" onClick={() => updateLine(i.productId, { qty: i.qty + 1 })}><Plus size={12} /></button>
                  </div>
                  <div className="col-span-2"><input type="number" className="field text-right" value={i.price} onChange={(e) => updateLine(i.productId, { price: Number(e.target.value) || 0 })} /></div>
                  <div className="col-span-2 text-right font-bold">{money(i.qty * i.price)}</div>
                  <div className="col-span-1 text-right"><button onClick={() => removeLine(i.productId)}><Trash2 size={16} style={{ color: "var(--stamp)" }} /></button></div>
                </div>
              ))}
              <div className="px-4 py-4" style={{ borderTop: "2px solid var(--ink)" }}>
                {overStock && <div className="text-sm flex items-center gap-1 mb-2" style={{ color: "var(--stamp)" }}><AlertTriangle size={14} /> কিছু পণ্যের চাহিদা স্টকের চেয়ে বেশি</div>}
                {alternatives.length > 0 && <div className="text-xs mb-2 px-2 py-1" style={{ background: "#EEF4FC", color: "var(--tab-navy)" }}>জেনেরিক সাবস্টিটিউট সাজেশন: {alternatives.map((a) => <button key={a.product.id} className="underline ml-2" onClick={() => addToCart(a.product)}>{a.product.name} ({a.product.stock} {a.product.unit})</button>)}</div>}
                {cart.some((i)=>products.find((p)=>p.id===i.productId)?.batches?.some((b)=>b.expiry && daysBetween(b.expiry) <= 60)) && <div className="text-xs mb-2" style={{ color: "var(--gold)" }}>FEFO সাজেশন: কাছাকাছি expiry batch আগে বিক্রি হবে।</div>}
                {customer?.allergies && <div className="text-xs mb-2 px-2 py-1" style={{background:"#FFF1F0",color:"var(--stamp)"}}>Patient allergy profile: {customer.allergies}</div>}
                {hasControlledItem && (
                  <div className="mb-3 border-2 p-3 max-w-2xl" style={{ borderColor: "var(--stamp)", background: "#FFF8F8" }}>
                    <div className="text-sm font-bold mb-2" style={{ color: "var(--stamp)" }}>নিয়ন্ত্রিত ওষুধের রেজিস্টার তথ্য</div>
                    <div className="grid md:grid-cols-3 gap-2">
                      <input className="field" placeholder="ক্রেতা/রোগীর নাম *" value={controlledInfo.name} onChange={(e) => setControlledInfo({ ...controlledInfo, name: e.target.value })} />
                      <input className="field" placeholder="ঠিকানা *" value={controlledInfo.address} onChange={(e) => setControlledInfo({ ...controlledInfo, address: e.target.value })} />
                      <input className="field" placeholder="প্রেসক্রিপশন নম্বর *" value={controlledInfo.prescriptionNo} onChange={(e) => setControlledInfo({ ...controlledInfo, prescriptionNo: e.target.value })} />
                      <input className="field" placeholder="রোগীর বয়স" value={controlledInfo.patientAge} onChange={(e) => setControlledInfo({ ...controlledInfo, patientAge: e.target.value })} />
                      <input className="field" placeholder="ডাক্তারের নাম" value={controlledInfo.doctorName} onChange={(e) => setControlledInfo({ ...controlledInfo, doctorName: e.target.value })} />
                      <input className="field" placeholder="ডাক্তারের রেজিস্ট্রেশন নং" value={controlledInfo.doctorRegNo} onChange={(e) => setControlledInfo({ ...controlledInfo, doctorRegNo: e.target.value })} />
                      <label className="text-xs flex items-center gap-2 border px-2 py-1">প্রেসক্রিপশনের ছবি (ঐচ্ছিক)<input type="file" accept="image/*" onChange={async (e) => { try { setPrescriptionImage(await compressImageFile(e.target.files?.[0])); } catch { pushToast("ছবিটি পড়া যায়নি", "warn"); } }} /></label>
                    </div>
                  </div>
                )}
                {hasRxItem && (
                  <div className="mb-3 max-w-sm">
                    <label className="text-xs block flex items-center gap-1" style={{ color: "var(--tab-navy)", fontWeight: 700 }}>Rx — প্রেসক্রিপশন/ডাক্তারের রেফারেন্স (ঐচ্ছিক)</label>
                    <input className="field" value={prescriptionRef} onChange={(e) => setPrescriptionRef(e.target.value)} placeholder="যেমন: ডা. রহিমের প্রেসক্রিপশন, বা রোগীর নাম" />
                  </div>
                )}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                  <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>ছাড়</label><input type="number" className="field" value={discount} onChange={(e) => { setDiscount(e.target.value); setPinApprovedBy(null); }} placeholder="0" />
                    {!isOwner && disc > 0 && discPercent >= discountPinLimit && !pinApprovedBy && <div className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "var(--stamp)" }}><KeyRound size={11} /> {discountPinLimit}%+ ছাড়ে মালিকের PIN লাগবে</div>}
                  </div>
                  <div><label className="text-xs block flex items-center gap-1" style={{ color: "var(--ink-faint)" }}><Percent size={11} /> ভ্যাট/ট্যাক্স (%)</label><input type="number" min="0" max="100" step="0.01" className="field" value={taxRateInput} onChange={(e) => setTaxRateInput(e.target.value)} placeholder="0" /></div>
                  <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>ডেলিভারি চার্জ</label><input type="number" className="field" value={shipping} onChange={(e) => setShipping(e.target.value)} placeholder="0" /></div>
                  <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>পেমেন্ট মাধ্যম</label>
                    <select className="field" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                      {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
                    </select>
                  </div>
                  <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>পরিশোধ</label><input type="number" className="field" placeholder={String(total)} value={paidInput} onChange={(e) => setPaidInput(e.target.value)} /></div>
                  <label className="text-xs flex items-center gap-1"><input type="checkbox" checked={splitEnabled} onChange={(e)=>setSplitEnabled(e.target.checked)} /> Split payment</label>{splitEnabled && <><div><label className="text-xs block">২য় মাধ্যম</label><select className="field" value={secondPayMethod} onChange={(e)=>setSecondPayMethod(e.target.value)}>{PAY_METHODS.map((m)=><option key={m}>{m}</option>)}</select></div><div><label className="text-xs block">২য় পরিশোধ</label><input type="number" className="field" value={secondPaid} onChange={(e)=>setSecondPaid(e.target.value)} /></div></>}
                </div>
                {isMobileBanking && shopMfsNumber && (
                  <div className="text-xs mb-3 px-3 py-2" style={{ background: "#F3ECD8", color: "var(--ink)" }}>
                    গ্রাহককে বলুন এই নম্বরে {payMethod} করতে: <b>{shopMfsNumber}</b>
                  </div>
                )}
                {(needsTxn || needsBankAcc || needsSenderNumber) && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                    {needsSenderNumber && <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>প্রেরকের নম্বর</label><input className="field" value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} placeholder="যেমন: 017XXXXXXXX" /></div>}
                    {needsTxn && <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>ট্রানজেকশন আইডি</label><input className="field" value={txnNo} onChange={(e) => setTxnNo(e.target.value)} placeholder="যেমন: TXN12345" /></div>}
                    {needsBankAcc && <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>ব্যাংক অ্যাকাউন্ট নং</label><input className="field" value={bankAccNo} onChange={(e) => setBankAccNo(e.target.value)} placeholder="অ্যাকাউন্ট নম্বর" /></div>}
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm" style={{ color: "var(--ink-faint)" }}>সাবটোটাল: {money(subtotal)}{disc > 0 && ` • ছাড়: -${money(disc)}`}{tax > 0 && ` • ভ্যাট (${taxRate}%): +${money(tax)}`}{ship > 0 && ` • চার্জ: +${money(ship)}`}
                    {due > 0 && <span className="ml-2" style={{ color: "var(--stamp)", fontWeight: 700 }}>বাকি থাকবে: {money(due)}</span>}
                    {pinApprovedBy && <span className="ml-2 text-xs" style={{ color: "var(--green)" }}>✓ {pinApprovedBy} এর অনুমোদনে বড় ছাড় দেওয়া হচ্ছে</span>}
                  </div>
                  <div className="flex items-center gap-6">
                    <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22 }}>মোট: {money(total)}</div>
                    <button onClick={attemptCheckout} disabled={overStock} className="ledger-btn ledger-btn-solid flex items-center gap-2" style={overStock ? { opacity: 0.5, cursor: "not-allowed" } : {}}>
                      {needsOwnerApproval ? <KeyRound size={18} /> : <Check size={18} />} {needsOwnerApproval ? "মালিকের অনুমতি দিন" : "বিক্রয় নিশ্চিত করুন"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
    {pinPrompt && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(33,38,31,0.55)" }}>
        <div className="w-full max-w-sm border-2 p-6" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          <div className="text-center mb-4">
            <KeyRound size={26} style={{ color: "var(--stamp)", margin: "0 auto 6px" }} />
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 20 }}>মালিকের PIN দিন</div>
            <div className="text-sm mt-1" style={{ color: "var(--ink-faint)" }}>{discPercent.toFixed(1)}% ছাড় ({money(disc)}) দিতে মালিকের অনুমোদন লাগবে</div>
          </div>
          <input
            autoFocus type="password" inputMode="numeric" maxLength={6}
            className="field text-center mb-2" style={{ fontSize: 22, letterSpacing: 6 }}
            placeholder="••••" value={pinInput}
            onChange={(e) => { setPinInput(e.target.value.replace(/\D/g, "")); setPinError(""); }}
            onKeyDown={(e) => e.key === "Enter" && verifyOwnerPin()}
          />
          {pinError && <div className="text-sm text-center mb-2" style={{ color: "var(--stamp)" }}>{pinError}</div>}
          <div className="flex gap-2 mt-3">
            <button className="ledger-btn flex-1" onClick={() => { setPinPrompt(false); setPinInput(""); setPinError(""); }}>বাতিল</button>
            <button className="ledger-btn ledger-btn-solid flex-1 justify-center" onClick={verifyOwnerPin}>অনুমোদন করুন</button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
function SalesList({ sales, setSales, products, setProducts, returns, setReturns, currentUser, pushToast, onBack, onPrint, logActivity = () => {} }) {
  const [q, setQ] = useState("");
  const [returningSale, setReturningSale] = useState(null);
  const filtered = sales.filter((s) => (s.customerName || "").toLowerCase().includes(q.toLowerCase()) || String(s.invoiceNo).includes(q));

  function cancelSale(saleId) {
    const sale = sales.find((x) => x.id === saleId); if (!sale || sale.cancelled) return;
    setSales((prev) => prev.map((x) => x.id === saleId ? { ...x, cancelled: true, cancelledAt: Date.now(), cancelledBy: currentUser.name } : x));
    setProducts((prev) => prev.map((p) => { const it = sale.items.find((x) => x.productId === p.id); return it ? { ...p, stock: p.stock + (it.baseQty || it.qty) } : p; }));
    pushToast(`ইনভয়েস #${sale.invoiceNo} বাতিল হয়েছে`, "warn");
    logActivity("sale_cancel", `ইনভয়েস #${sale.invoiceNo} বাতিল — স্টক ফেরত`, { refId: saleId });
  }

  function applyReturn(saleId, items) {
    const cashBack = { amount: 0 };
    const saleRef = sales.find((s) => s.id === saleId);
    setSales((prev) => prev.map((s) => {
      if (s.id !== saleId) return s;
      const refundAmt = items.reduce((a, r) => a + r.qty * r.price, 0);
      const newItems = s.items.map((it) => {
        const r = items.find((x) => x.productId === it.productId);
        return r ? { ...it, returnedQty: (it.returnedQty || 0) + r.qty } : it;
      });
      const newTotal = Math.max(0, s.total - refundAmt);
      const newPaid = Math.min(s.paid, newTotal);
      cashBack.amount = Math.max(0, s.paid - newTotal);
      const newDue = Math.max(0, newTotal - newPaid);
      return { ...s, items: newItems, total: newTotal, subtotal: Math.max(0, (s.subtotal ?? s.total) - refundAmt), paid: newPaid, due: newDue };
    }));
    setProducts((prev) => prev.map((p) => {
      const r = items.find((x) => x.productId === p.id);
      return r ? { ...p, stock: p.stock + r.qty } : p;
    }));
    const refundAmt = items.reduce((a, r) => a + r.qty * r.price, 0);
    setReturns((prev) => [{ id: uid(), saleId, date: todayStr(), createdAt: Date.now(), items, amount: refundAmt, by: currentUser.name }, ...prev]);
    setReturningSale(null);
    pushToast(cashBack.amount > 0 ? `রিটার্ন সম্পন্ন — গ্রাহককে নগদ ফেরত দিন: ${money(cashBack.amount)}` : "রিটার্ন সম্পন্ন হয়েছে ✓");
    logActivity("sale_return", `ইনভয়েস #${saleRef?.invoiceNo ?? ""} — রিটার্ন মূল্য ${money(refundAmt)}`, { refId: saleId });
  }

  return (
    <div>
      <button className="flex items-center gap-1 mb-4 text-sm" style={{ color: "var(--ink-faint)" }} onClick={onBack}><ArrowLeft size={14} /> নতুন বিক্রয়ে ফিরে যান</button>
      <SectionTitle icon={ListIcon}>সব বিক্রয়ের তালিকা</SectionTitle>
      <div className="mb-4 max-w-sm flex items-center gap-2 border-2 px-3 py-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        <Search size={16} style={{ color: "var(--ink-faint)" }} /><input className="field" style={{ borderBottom: "none" }} placeholder="ইনভয়েস নং বা কাস্টমার খুঁজুন…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="border-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        <div className="hidden md:grid grid-cols-8 px-4 py-2 text-sm font-bold" style={{ borderBottom: "2px solid var(--ink)", color: "var(--ink-faint)" }}>
          <div>ইনভয়েস</div><div>তারিখ</div><div className="col-span-2">কাস্টমার</div><div className="text-right">মোট</div><div>অবস্থা</div><div className="text-right col-span-2">অ্যাকশন</div>
        </div>
        {filtered.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--ink-faint)" }}>কোনো বিক্রয় নেই।</div>}
        {filtered.map((s, i) => {
          const st = s.cancelled ? { label: "বাতিল", tone: "red" } : payStatus(s.total, s.due);
          const canReturn = !s.cancelled && s.items.some((it) => it.qty - (it.returnedQty || 0) > 0);
          return (
            <div key={s.id} className="grid grid-cols-2 md:grid-cols-8 px-4 py-2.5 items-center gap-1" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
              <div>#{s.invoiceNo}</div><div className="text-sm" style={{ color: "var(--ink-faint)" }}>{bnDate(s.date)}</div>
              <div className="col-span-2">{s.customerName}</div>
              <div className="text-right font-bold">{money(s.total)}</div>
              <div><Badge tone={st.tone}>{st.label}</Badge></div>
              <div className="text-right col-span-2 flex gap-2 justify-end">
                {canReturn && <button className="ledger-btn ledger-btn-sm flex items-center gap-1" onClick={() => setReturningSale(s)}><RotateCcw size={13} /> রিটার্ন</button>}
                {!s.cancelled && <button className="ledger-btn ledger-btn-sm" style={{ color: "var(--stamp)" }} onClick={() => cancelSale(s.id)}>বাতিল</button>}
                <button className="ledger-btn ledger-btn-sm" onClick={() => onPrint(s)}><Printer size={13} /></button>
              </div>
            </div>
          );
        })}
      </div>
      {returningSale && <ReturnModal sale={returningSale} onClose={() => setReturningSale(null)} onSubmit={(items) => applyReturn(returningSale.id, items)} />}
    </div>
  );
}
function ReturnModal({ sale, onClose, onSubmit }) {
  const [qtys, setQtys] = useState(() => Object.fromEntries(sale.items.map((it) => [it.productId, 0])));
  const rows = sale.items.map((it) => ({ ...it, maxReturn: it.qty - (it.returnedQty || 0) }));
  const total = rows.reduce((a, it) => a + (Number(qtys[it.productId]) || 0) * it.price, 0);
  const anySelected = rows.some((it) => (Number(qtys[it.productId]) || 0) > 0);

  function submit() {
    const items = rows.filter((it) => (Number(qtys[it.productId]) || 0) > 0).map((it) => ({ productId: it.productId, name: it.name, qty: Math.min(Number(qtys[it.productId]) || 0, it.maxReturn), price: it.price }));
    if (items.length === 0) return;
    onSubmit(items);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(33,38,31,0.55)" }}>
      <div className="w-full max-w-lg border-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        <div className="p-5">
          <SectionTitle icon={RotateCcw}>ইনভয়েস #{sale.invoiceNo} — রিটার্ন</SectionTitle>
          <p className="text-sm mb-3" style={{ color: "var(--ink-faint)" }}>যে পণ্যগুলো ফেরত নিচ্ছেন তার পরিমাণ দিন। স্টকে আবার যোগ হয়ে যাবে।</p>
          <div className="border-2" style={{ borderColor: "var(--ink)" }}>
            <div className="grid grid-cols-4 px-3 py-2 text-xs font-bold" style={{ borderBottom: "2px solid var(--ink)", color: "var(--ink-faint)" }}>
              <div className="col-span-2">পণ্য</div><div className="text-center">বিক্রি হয়েছিল</div><div className="text-center">ফেরত পরিমাণ</div>
            </div>
            {rows.map((it, i) => (
              <div key={it.productId} className="grid grid-cols-4 px-3 py-2 items-center gap-1" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
                <div className="col-span-2 text-sm">{it.name}{it.returnedQty ? <span className="text-xs" style={{ color: "var(--ink-faint)" }}> (আগে ফেরত: {it.returnedQty})</span> : null}</div>
                <div className="text-center text-sm">{it.qty} {it.unit}</div>
                <div className="text-center">
                  {it.maxReturn > 0 ? (
                    <input type="number" min={0} max={it.maxReturn} className="field text-center" style={{ width: 56 }}
                      value={qtys[it.productId]}
                      onChange={(e) => setQtys((q2) => ({ ...q2, [it.productId]: Math.max(0, Math.min(it.maxReturn, Number(e.target.value) || 0)) }))} />
                  ) : <span className="text-xs" style={{ color: "var(--ink-faint)" }}>সব ফেরত হয়েছে</span>}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between mt-4">
            <div style={{ fontWeight: 700 }}>মোট ফেরত: {money(total)}</div>
            <div className="flex gap-2">
              <button className="ledger-btn" onClick={onClose}>বাতিল</button>
              <button className="ledger-btn ledger-btn-solid" disabled={!anySelected} style={!anySelected ? { opacity: 0.5, cursor: "not-allowed" } : {}} onClick={submit}>রিটার্ন নিশ্চিত করুন</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Purchase tab ----------
function PurchaseTab({ products, setProducts, purchases, setPurchases, suppliers, setSuppliers, payments, currentUser, pushToast, purchaseOrders = [], setPurchaseOrders, onPrint, logActivity = () => {} }) {
  const [view, setView] = useState("new");
  const [cart, setCart] = useState([]);
  const [supplier, setSupplier] = useState(null);
  const [refNo, setRefNo] = useState("");
  const [paidInput, setPaidInput] = useState("");
  const [extra, setExtra] = useState("");
  const [newProdOpen, setNewProdOpen] = useState(false);
  const [newProd, setNewProd] = useState({ name: "", sku: "", barcode: "", category: "", unit: "পিস", cost: "", sellPrice: "", qty: "", batchNo: "", expiry: "" });
  const [payMethod, setPayMethod] = useState("ক্যাশ");
  const [txnNo, setTxnNo] = useState("");
  const [bankAccNo, setBankAccNo] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const [receivingPoId, setReceivingPoId] = useState(null); // যে PO রিসিভ করা হচ্ছে, চেকআউটের পর এটাকে "received" মার্ক করা হবে
  const { needsTxn, needsBankAcc, needsSenderNumber } = payMethodFlags(payMethod);

  function receivePO(po) {
    const sup = suppliers.find((s) => s.id === po.supplierId);
    setCart(po.items.map((i) => {
      const prod = products.find((p) => p.id === i.productId);
      return { productId: i.productId, name: i.name, unit: i.unit, qty: i.qty, cost: prod?.purchasePrice || 0, sellPrice: prod?.sellPrice || 0, isNew: false, batchNo: "", expiry: "" };
    }));
    setSupplier(sup || null);
    setReceivingPoId(po.id);
    setView("new");
    pushToast("PO-এর পণ্য কার্টে যোগ হয়েছে — দাম/ব্যাচ ঠিক করে ক্রয় সম্পন্ন করুন");
  }
  function cancelPO(id) { setPurchaseOrders((pos) => pos.map((p) => (p.id === id ? { ...p, status: "cancelled" } : p))); pushToast("অর্ডার বাতিল করা হয়েছে", "warn"); }

  function addExisting(p) {
    setCart((c) => { const ex = c.find((i) => i.productId === p.id); if (ex) return c.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + 1 } : i)); return [...c, { productId: p.id, name: p.name, unit: p.unit, qty: 1, cost: p.purchasePrice || 0, sellPrice: p.sellPrice || 0, isNew: false, batchNo: "", expiry: "" }]; });
  }
  function addNewProduct() {
    if (!newProd.name.trim()) return;
    const tempId = "new-" + uid();
    const cost = Number(newProd.cost) || 0;
    const sellPrice = newProd.sellPrice === "" ? Math.round(cost * 1.2) : Number(newProd.sellPrice) || 0;
    setCart((c) => [...c, { productId: tempId, name: newProd.name.trim(), sku: newProd.sku, barcode: newProd.barcode, unit: newProd.unit || "পিস", qty: Number(newProd.qty) || 1, cost, sellPrice, isNew: true, category: newProd.category, batchNo: newProd.batchNo, expiry: newProd.expiry }]);
    setNewProd({ name: "", sku: "", barcode: "", category: "", unit: "পিস", cost: "", sellPrice: "", qty: "", batchNo: "", expiry: "" }); setNewProdOpen(false);
  }
  function updateLine(id, patch) { setCart((c) => c.map((i) => (i.productId === id ? { ...i, ...patch } : i))); }
  function removeLine(id) { setCart((c) => c.filter((i) => i.productId !== id)); }
  const subtotal = cart.reduce((a, i) => a + i.qty * i.cost, 0);
  const extraCharge = Math.max(0, Number(extra) || 0);
  const total = subtotal + extraCharge;
  const paid = paidInput === "" ? total : Math.max(0, Number(paidInput) || 0);
  const due = Math.max(0, total - paid);

  function checkout() {
    if (cart.length === 0) return;
    if (due > 0 && !supplier) { pushToast("বাকি রাখতে হলে সাপ্লায়ার বেছে নিন", "warn"); return; }
    let prods = [...products]; const finalItems = [];
    cart.forEach((i) => {
      const batchNo = (i.batchNo || "").trim();
      const expiry = i.expiry || "";
      const hasBatchInfo = !!(batchNo || expiry);
      if (i.isNew) {
        const p = { id: uid(), name: i.name, sku: i.sku || "", barcode: i.barcode || "", category: i.category || "সাধারণ", unit: i.unit, stock: i.qty, purchasePrice: i.cost, sellPrice: i.sellPrice || Math.round(i.cost * 1.2), lowStockAt: 5, batches: hasBatchInfo ? [{ id: uid(), batchNo, expiry, qty: i.qty }] : [], expiry: hasBatchInfo ? expiry : "" };
        prods.push(p); finalItems.push({ productId: p.id, name: p.name, qty: i.qty, cost: i.cost, unit: i.unit, batchNo, expiry });
      } else {
        prods = prods.map((p) => {
          if (p.id !== i.productId) return p;
          const updated = { ...p, purchasePrice: i.cost, sellPrice: i.sellPrice || p.sellPrice };
          // পণ্যটা আগে থেকে ব্যাচ-ট্র্যাক করলে, অথবা এই ক্রয়ে ব্যাচ/মেয়াদ দেওয়া থাকলে — নতুন ব্যাচ যোগ হয়
          if ((updated.batches && updated.batches.length) || hasBatchInfo) {
            const existingBatches = updated.batches && updated.batches.length ? updated.batches : (updated.stock > 0 ? [{ id: uid(), batchNo: "পুরনো স্টক", expiry: updated.expiry || "", qty: updated.stock }] : []);
            const newBatch = { id: uid(), batchNo: batchNo || "অজানা ব্যাচ", expiry, qty: i.qty };
            return syncStockFromBatches({ ...updated, batches: [...existingBatches, newBatch] });
          }
          return { ...updated, stock: updated.stock + i.qty };
        });
        finalItems.push({ productId: i.productId, name: i.name, qty: i.qty, cost: i.cost, unit: i.unit, batchNo, expiry });
      }
    });
    setProducts(prods);
    const purchase = { id: uid(), refNo: refNo.trim(), date: todayStr(), createdAt: Date.now(), items: finalItems, subtotal, extra: extraCharge, total, paid, due, payMethod, txnNo: needsTxn ? txnNo.trim() : "", bankAccNo: needsBankAcc ? bankAccNo.trim() : "", senderNumber: needsSenderNumber ? senderNumber.trim() : "", supplierId: supplier?.id || null, supplierName: supplier?.name || "সাধারণ সাপ্লায়ার", purchasedBy: currentUser.name, poId: receivingPoId || null };
    setPurchases((p) => [purchase, ...p]);
    if (receivingPoId) { setPurchaseOrders((pos) => pos.map((p) => (p.id === receivingPoId ? { ...p, status: "received", receivedAt: Date.now() } : p))); setReceivingPoId(null); }
    setCart([]); setSupplier(null); setPaidInput(""); setRefNo(""); setExtra(""); setTxnNo(""); setBankAccNo(""); setSenderNumber("");
    pushToast("ক্রয় যোগ হয়েছে ও স্টক আপডেট হয়েছে ✓");
    logActivity("purchase", `${purchase.supplierName} — মোট ${money(purchase.total)}${purchase.refNo ? ` (রেফ: ${purchase.refNo})` : ""}`, { refId: purchase.id });
    onPrint(purchase);
  }

  if (view === "list") return <PurchaseList purchases={purchases} onBack={() => setView("new")} onPrint={onPrint} />;
  if (view === "orders") return <PurchaseOrdersList purchaseOrders={purchaseOrders} onBack={() => setView("new")} onReceive={receivePO} onCancel={cancelPO} />;

  return (
    <div>
      <SectionTitle icon={PackagePlus} right={
        <div className="flex flex-wrap gap-2">
          <button className="ledger-btn ledger-btn-sm flex items-center gap-1" onClick={() => setView("orders")}><ClipboardList size={14} /> অর্ডার (PO){purchaseOrders.filter((p) => p.status === "pending").length > 0 && ` — ${purchaseOrders.filter((p) => p.status === "pending").length}`}</button>
          <button className="ledger-btn ledger-btn-sm flex items-center gap-1" onClick={() => setView("list")}><ListIcon size={14} /> সব ক্রয়ের তালিকা</button>
        </div>
      }>{receivingPoId ? "অর্ডার রিসিভ করুন" : "নতুন ক্রয়"}</SectionTitle>

      <div className="grid md:grid-cols-3 gap-4 mb-4">
        <div className="md:col-span-1">
          <label className="text-xs block mb-1" style={{ color: "var(--ink-faint)" }}>রেফারেন্স/চালান নং (ঐচ্ছিক)</label>
          <input className="field border-2 px-3 py-2" style={{ borderColor: "var(--ink)" }} value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="যেমন: 6789" />
        </div>
        <div className="md:col-span-2">
          <label className="text-xs block mb-1" style={{ color: "var(--ink-faint)" }}>সাপ্লায়ার (ঐচ্ছিক — বাকি রাখতে প্রয়োজন)</label>
          <PartyPicker parties={suppliers} selected={supplier} onSelect={setSupplier} onCreateNew={(p) => setSuppliers((s) => [...s, p])} label="সাপ্লায়ার" placeholder="সাপ্লায়ারের নাম/নম্বর খুঁজুন…" />
        </div>
      </div>

      <div className="mb-4">
        <label className="text-xs block mb-1" style={{ color: "var(--ink-faint)" }}>পণ্য</label>
        <div className="flex gap-2 max-w-2xl">
          <div className="flex-1"><ProductPicker products={products} onPick={addExisting} placeholder="আগের পণ্য খুঁজুন বা বারকোড স্ক্যান করুন…" allowCameraScan /></div>
          <button className="ledger-btn flex items-center gap-2 shrink-0" onClick={() => setNewProdOpen((v) => !v)}><Plus size={16} /> নতুন</button>
        </div>
      </div>

      {newProdOpen && (
        <div className="border-2 p-4 mb-4 grid grid-cols-2 md:grid-cols-9 gap-3" style={{ borderColor: "var(--gold)", background: "var(--paper)" }}>
          <div className="col-span-2 md:col-span-1"><label className="text-xs" style={{ color: "var(--ink-faint)" }}>পণ্যের নাম</label><input className="field" value={newProd.name} onChange={(e) => setNewProd({ ...newProd, name: e.target.value })} /></div>
          <div><label className="text-xs" style={{ color: "var(--ink-faint)" }}>SKU (ঐচ্ছিক)</label><input className="field" value={newProd.sku} onChange={(e) => setNewProd({ ...newProd, sku: e.target.value })} /></div>
          <div><label className="text-xs" style={{ color: "var(--ink-faint)" }}>বারকোড (ঐচ্ছিক)</label><input className="field" value={newProd.barcode} onChange={(e) => setNewProd({ ...newProd, barcode: e.target.value })} /></div>
          <div><label className="text-xs" style={{ color: "var(--ink-faint)" }}>ক্যাটাগরি</label><input className="field" value={newProd.category} onChange={(e) => setNewProd({ ...newProd, category: e.target.value })} /></div>
          <div><label className="text-xs" style={{ color: "var(--ink-faint)" }}>একক</label><input className="field" value={newProd.unit} onChange={(e) => setNewProd({ ...newProd, unit: e.target.value })} /></div>
          <div><label className="text-xs" style={{ color: "var(--ink-faint)" }}>পরিমাণ</label><input type="number" className="field" value={newProd.qty} onChange={(e) => setNewProd({ ...newProd, qty: e.target.value })} /></div>
          <div><label className="text-xs" style={{ color: "var(--ink-faint)" }}>ক্রয় মূল্য (একক)</label><input type="number" className="field" value={newProd.cost} onChange={(e) => setNewProd({ ...newProd, cost: e.target.value })} /></div>
          <div><label className="text-xs" style={{ color: "var(--ink-faint)" }}>বিক্রয় মূল্য (একক)</label><input type="number" className="field" value={newProd.sellPrice} onChange={(e) => setNewProd({ ...newProd, sellPrice: e.target.value })} placeholder={newProd.cost ? String(Math.round((Number(newProd.cost) || 0) * 1.2)) : ""} /></div>
          <div><label className="text-xs" style={{ color: "var(--ink-faint)" }}>ব্যাচ/লট নং (ঐচ্ছিক)</label><input className="field" value={newProd.batchNo} onChange={(e) => setNewProd({ ...newProd, batchNo: e.target.value })} /></div>
          <div><label className="text-xs" style={{ color: "var(--ink-faint)" }}>মেয়াদ (ঐচ্ছিক)</label><input type="date" className="field" value={newProd.expiry} onChange={(e) => setNewProd({ ...newProd, expiry: e.target.value })} /></div>
          <div className="flex items-end"><button className="ledger-btn ledger-btn-navy w-full justify-center" onClick={addNewProduct}>যোগ</button></div>
        </div>
      )}

      {cart.length === 0 ? <EmptyState text="উপরে থেকে পণ্য খুঁজুন অথবা নতুন পণ্য যোগ করুন।" /> : (
        <div className="border-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          <div className="grid grid-cols-12 px-4 py-2 text-sm font-bold" style={{ borderBottom: "2px solid var(--ink)", color: "var(--ink-faint)" }}>
            <div className="col-span-3">পণ্য</div><div className="col-span-2 text-center">পরিমাণ</div><div className="col-span-2 text-right">ক্রয় মূল্য</div><div className="col-span-2 text-right">বিক্রয় মূল্য</div><div className="col-span-2 text-right">মোট</div><div className="col-span-1"></div>
          </div>
          {cart.map((i) => (
            <div key={i.productId} className="px-4 py-2.5" style={{ borderBottom: "1px solid var(--rule-blue)" }}>
              <div className="grid grid-cols-12 items-center">
                <div className="col-span-3">{i.name} {i.isNew && <span className="text-xs" style={{ color: "var(--gold)" }}>(নতুন)</span>}</div>
                <div className="col-span-2 flex items-center justify-center gap-1">
                  <button className="ledger-btn p-1" onClick={() => updateLine(i.productId, { qty: Math.max(1, i.qty - 1) })}><Minus size={12} /></button>
                  <input type="number" className="field text-center" style={{ width: 44 }} value={i.qty} onChange={(e) => updateLine(i.productId, { qty: Math.max(1, Number(e.target.value) || 1) })} />
                  <button className="ledger-btn p-1" onClick={() => updateLine(i.productId, { qty: i.qty + 1 })}><Plus size={12} /></button>
                </div>
                <div className="col-span-2"><input type="number" className="field text-right" value={i.cost} onChange={(e) => updateLine(i.productId, { cost: Number(e.target.value) || 0 })} /></div>
                <div className="col-span-2"><input type="number" className="field text-right" value={i.sellPrice || 0} onChange={(e) => updateLine(i.productId, { sellPrice: Number(e.target.value) || 0 })} /></div>
                <div className="col-span-2 text-right font-bold">{money(i.qty * i.cost)}</div>
                <div className="col-span-1 text-right"><button onClick={() => removeLine(i.productId)}><Trash2 size={16} style={{ color: "var(--stamp)" }} /></button></div>
              </div>
              <div className="grid grid-cols-2 gap-2 mt-1.5 max-w-md">
                <input className="field text-sm" placeholder="ব্যাচ/লট নং (ঐচ্ছিক)" value={i.batchNo || ""} onChange={(e) => updateLine(i.productId, { batchNo: e.target.value })} />
                <input type="date" className="field text-sm" placeholder="মেয়াদ (ঐচ্ছিক)" value={i.expiry || ""} onChange={(e) => updateLine(i.productId, { expiry: e.target.value })} />
              </div>
            </div>
          ))}
          <div className="px-4 py-4" style={{ borderTop: "2px solid var(--ink)" }}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>অতিরিক্ত খরচ (পরিবহন ইত্যাদি)</label><input type="number" className="field" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="0" /></div>
              <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>পেমেন্ট মাধ্যম</label>
                <select className="field" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>পরিশোধ</label><input type="number" className="field" placeholder={String(total)} value={paidInput} onChange={(e) => setPaidInput(e.target.value)} /></div>
            </div>
            {(needsTxn || needsBankAcc || needsSenderNumber) && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                {needsSenderNumber && <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>প্রেরকের নম্বর</label><input className="field" value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} placeholder="যেমন: 017XXXXXXXX" /></div>}
                {needsTxn && <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>ট্রানজেকশন আইডি</label><input className="field" value={txnNo} onChange={(e) => setTxnNo(e.target.value)} placeholder="যেমন: TXN12345" /></div>}
                {needsBankAcc && <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>ব্যাংক অ্যাকাউন্ট নং</label><input className="field" value={bankAccNo} onChange={(e) => setBankAccNo(e.target.value)} placeholder="অ্যাকাউন্ট নম্বর" /></div>}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="text-sm" style={{ color: "var(--ink-faint)" }}>সাবটোটাল: {money(subtotal)}{extraCharge > 0 && ` • অতিরিক্ত: +${money(extraCharge)}`}
                {due > 0 && <span className="ml-2" style={{ color: "var(--stamp)", fontWeight: 700 }}>বাকি থাকবে: {money(due)}</span>}
              </div>
              <div className="flex items-center gap-6">
                <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 22 }}>মোট: {money(total)}</div>
                <button onClick={checkout} className="ledger-btn ledger-btn-navy flex items-center gap-2"><Check size={18} /> ক্রয় নিশ্চিত করুন</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
function PurchaseList({ purchases, onBack, onPrint }) {
  const [q, setQ] = useState("");
  const filtered = purchases.filter((p) => (p.supplierName || "").toLowerCase().includes(q.toLowerCase()) || (p.refNo || "").includes(q));
  return (
    <div>
      <button className="flex items-center gap-1 mb-4 text-sm" style={{ color: "var(--ink-faint)" }} onClick={onBack}><ArrowLeft size={14} /> নতুন ক্রয়ে ফিরে যান</button>
      <SectionTitle icon={ListIcon}>সব ক্রয়ের তালিকা</SectionTitle>
      <div className="mb-4 max-w-sm flex items-center gap-2 border-2 px-3 py-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        <Search size={16} style={{ color: "var(--ink-faint)" }} /><input className="field" style={{ borderBottom: "none" }} placeholder="রেফারেন্স নং বা সাপ্লায়ার খুঁজুন…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="border-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        <div className="hidden md:grid grid-cols-7 px-4 py-2 text-sm font-bold" style={{ borderBottom: "2px solid var(--ink)", color: "var(--ink-faint)" }}>
          <div>রেফারেন্স</div><div>তারিখ</div><div className="col-span-2">সাপ্লায়ার</div><div className="text-right">মোট</div><div>অবস্থা</div><div></div>
        </div>
        {filtered.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--ink-faint)" }}>কোনো ক্রয় নেই।</div>}
        {filtered.map((p, i) => {
          const st = payStatus(p.total, p.due);
          return (
            <div key={p.id} className="grid grid-cols-2 md:grid-cols-7 px-4 py-2.5 items-center gap-1" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
              <div>{p.refNo || "-"}</div><div className="text-sm" style={{ color: "var(--ink-faint)" }}>{bnDate(p.date)}</div>
              <div className="col-span-2">{p.supplierName}</div><div className="text-right font-bold">{money(p.total)}</div>
              <div><Badge tone={st.tone}>{st.label}</Badge></div>
              <div className="text-right"><button className="ledger-btn ledger-btn-sm" title="সাপ্লায়ারের স্লিপ প্রিন্ট করুন" onClick={() => onPrint(p)}><Printer size={13} /></button></div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PurchaseOrdersList({ purchaseOrders, onBack, onReceive, onCancel }) {
  const pending = purchaseOrders.filter((p) => p.status === "pending");
  const others = purchaseOrders.filter((p) => p.status !== "pending").sort((a, b) => b.createdAt - a.createdAt);
  return (
    <div>
      <button className="flex items-center gap-1 mb-4 text-sm" style={{ color: "var(--ink-faint)" }} onClick={onBack}><ArrowLeft size={14} /> নতুন ক্রয়ে ফিরে যান</button>
      <SectionTitle icon={ClipboardList}>অর্ডার (Purchase Order)</SectionTitle>
      <p className="text-xs mb-4" style={{ color: "var(--ink-faint)" }}>স্টক ট্যাবের রি-অর্ডার সাজেশন থেকে তৈরি করা অর্ডারগুলো এখানে দেখা যাবে। "রিসিভ করুন" চাপলে পণ্যগুলো ক্রয়ের কার্টে যোগ হয়ে যাবে, দাম/ব্যাচ ঠিক করে ক্রয় সম্পন্ন করলে অর্ডারটা "রিসিভড" হয়ে যাবে।</p>

      {pending.length === 0 ? <EmptyState text="কোনো পেন্ডিং অর্ডার নেই।" /> : (
        <div className="border-2 mb-6" style={{ borderColor: "var(--gold)", background: "var(--paper)" }}>
          {pending.map((po, i) => (
            <div key={po.id} className="px-4 py-3" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <div style={{ fontWeight: 700 }}>{po.poNo} <span className="text-xs font-normal" style={{ color: "var(--ink-faint)" }}>• {bnDate(po.date)}</span></div>
                  <div className="text-sm" style={{ color: "var(--ink-faint)" }}>{po.supplierName}</div>
                </div>
                <div className="flex gap-2">
                  <button className="ledger-btn ledger-btn-sm" style={{ color: "var(--stamp)" }} onClick={() => onCancel(po.id)}>বাতিল করুন</button>
                  <button className="ledger-btn ledger-btn-navy ledger-btn-sm flex items-center gap-1" onClick={() => onReceive(po)}><Check size={13} /> রিসিভ করুন</button>
                </div>
              </div>
              <div className="text-sm mt-1.5" style={{ color: "var(--ink-faint)" }}>{po.items.map((it) => `${it.name} (${it.qty} ${it.unit})`).join(", ")}</div>
            </div>
          ))}
        </div>
      )}

      {others.length > 0 && (
        <>
          <SectionTitle icon={ListIcon}>আগের অর্ডার</SectionTitle>
          <div className="border-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
            {others.map((po, i) => (
              <div key={po.id} className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
                <div><span style={{ fontWeight: 600 }}>{po.poNo}</span> <span className="text-xs" style={{ color: "var(--ink-faint)" }}>{po.supplierName} • {bnDate(po.date)}</span></div>
                <Badge tone={po.status === "received" ? "green" : "red"}>{po.status === "received" ? "রিসিভড" : "বাতিল"}</Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ImagePreviewModal({ src, title, onClose }) {
  if (!src) return null;
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,.72)" }} onClick={onClose}><div className="max-w-3xl max-h-[90vh] p-3" style={{ background: "#fff" }} onClick={(e) => e.stopPropagation()}><div className="flex items-center justify-between mb-2 font-bold"><span>{title}</span><button onClick={onClose}><X size={20} /></button></div><img src={src} alt={title} style={{ maxWidth: "min(80vw, 720px)", maxHeight: "75vh", objectFit: "contain" }} /></div></div>;
}

// ---------- Stock tab ----------
function StockTab({ products, setProducts, pushToast, onPrintLabel, writeOffs, setWriteOffs, suppliers = [], purchaseOrders = [], setPurchaseOrders, logActivity = () => {} }) {
  const [q, setQ] = useState(""); const [editing, setEditing] = useState(null); const [adding, setAdding] = useState(false);
  const [expanded, setExpanded] = useState({}); // ব্যাচ-বিস্তারিত দেখানোর জন্য কোন পণ্য খোলা আছে
  const [writeOffTarget, setWriteOffTarget] = useState(null); // { product, batch? } — নষ্ট/ক্ষতি এন্ট্রির জন্য
  const [adjustTarget, setAdjustTarget] = useState(null);
  const [reorderQty, setReorderQty] = useState({}); // productId -> qty (রি-অর্ডার সাজেশনে এডিট করা পরিমাণ)
  const [reorderSelected, setReorderSelected] = useState({}); // productId -> true/false
  const [showReorderPanel, setShowReorderPanel] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [reorderSupplier, setReorderSupplier] = useState("");
  const blank = { name: "", sku: "", barcode: "", category: "", unit: "পিস", stock: "", purchasePrice: "", sellPrice: "", wholesalePrice: "", lowStockAt: "5", detail: "", expiry: "", genericName: "", dose: "", requiresRx: false, isControlled: false, isAntibiotic: false, isHighAlert: false, favorite: false, allergyTags: "", interactionTags: "", manufacturer: "", dosageForm: "", storageInstruction: "", rack: "", reorderLevel: "5", maxStock: "", unitOptions: [], imageData: "", batches: [] };
  const [form, setForm] = useState(blank);
  const filtered = products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()) || (p.sku || "").toLowerCase().includes(q.toLowerCase()) || (p.barcode || "").toLowerCase().includes(q.toLowerCase()) || (p.genericName || "").toLowerCase().includes(q.toLowerCase()));
  const UNIT_CHIPS = ["পিস", "কেজি", "গ্রাম", "লিটার", "বক্স", "প্যাকেট", "বোতল", "স্ট্রিপ", "ট্যাবলেট"];
  const lowStock = products.filter((p) => p.stock <= (p.lowStockAt ?? 5));
  // সাজেশন: স্টক ২× সতর্কতা-সীমায় পৌঁছাতে যত লাগবে
  const suggestedQty = (p) => Math.max((p.lowStockAt ?? 5) * 2 - p.stock, p.lowStockAt ?? 5);

  function createReorderPO() {
    const items = lowStock.filter((p) => reorderSelected[p.id]).map((p) => ({ productId: p.id, name: p.name, unit: p.unit, qty: Number(reorderQty[p.id] ?? suggestedQty(p)) || 1 }));
    if (!items.length) { pushToast("অন্তত একটা পণ্য বেছে নিন", "warn"); return; }
    const sup = suppliers.find((s) => s.id === reorderSupplier);
    setPurchaseOrders((pos) => [{ id: uid(), poNo: "PO-" + (pos.length + 1).toString().padStart(4, "0"), date: todayStr(), createdAt: Date.now(), status: "pending", supplierId: sup?.id || null, supplierName: sup?.name || "সাপ্লায়ার নির্ধারিত না", items }, ...pos]);
    setShowReorderPanel(false); setReorderSelected({}); setReorderQty({}); setReorderSupplier("");
    pushToast("রি-অর্ডার (PO) তৈরি হয়েছে ✓ — ক্রয় ট্যাবের 'অর্ডার' অংশে দেখুন");
  }


  function submitAdjustment({ product, qty, reason }) {
    const nextQty = Math.max(0, Number(product.stock) + Number(qty));
    setProducts((ps) => ps.map((p) => p.id === product.id ? { ...p, stock: nextQty } : p));
    logActivity("stock_adjust", `${product.name} — ${Number(qty) >= 0 ? "+" : ""}${Number(qty)} ${product.unit} — ${reason || "ম্যানুয়াল সমন্বয়"}`, { refId: product.id });
    setAdjustTarget(null); pushToast("স্টক সমন্বয় হয়েছে ✓");
  }

  function submitWriteOff({ product, batch, qty, reason }) {
    const takeQty = Math.max(0, Math.min(qty, batch ? batch.qty : product.stock));
    if (takeQty <= 0) return;
    setProducts((prods) => prods.map((p) => {
      if (p.id !== product.id) return p;
      if (batch) {
        const newBatches = p.batches.map((b) => (b.id === batch.id ? { ...b, qty: b.qty - takeQty } : b)).filter((b) => b.qty > 0);
        return syncStockFromBatches({ ...p, batches: newBatches });
      }
      return { ...p, stock: Math.max(0, p.stock - takeQty) };
    }));
    setWriteOffs((wo) => [{ id: uid(), date: todayStr(), createdAt: Date.now(), productId: product.id, productName: product.name, batchNo: batch?.batchNo || "", qty: takeQty, unit: product.unit, unitCost: product.purchasePrice || 0, lossValue: takeQty * (product.purchasePrice || 0), reason: reason.trim() || "মেয়াদ শেষ/নষ্ট" }, ...wo]);
    setWriteOffTarget(null);
    pushToast(`${takeQty} ${product.unit} স্টক থেকে ক্ষতি হিসেবে বাদ দেওয়া হয়েছে`, "warn");
    logActivity("write_off", `${product.name} — ${takeQty} ${product.unit} — কারণ: ${reason.trim() || "মেয়াদ শেষ/নষ্ট"}`, { refId: product.id });
  }

  function startEdit(p) { setEditing(p.id); setForm({ name: p.name, sku: p.sku || "", barcode: p.barcode || "", category: p.category, unit: p.unit, stock: p.stock, purchasePrice: p.purchasePrice, sellPrice: p.sellPrice, wholesalePrice: p.wholesalePrice || "", lowStockAt: p.lowStockAt ?? 5, detail: p.detail || "", expiry: p.expiry || "", genericName: p.genericName || "", dose: p.dose || "", requiresRx: !!p.requiresRx, isControlled: !!p.isControlled, isAntibiotic: !!p.isAntibiotic, isHighAlert: !!p.isHighAlert, favorite: !!p.favorite, allergyTags: p.allergyTags || "", interactionTags: p.interactionTags || "", manufacturer: p.manufacturer || "", dosageForm: p.dosageForm || "", storageInstruction: p.storageInstruction || "", rack: p.rack || "", reorderLevel: p.reorderLevel ?? 5, maxStock: p.maxStock || "", unitOptions: (p.unitOptions || []).map((x) => ({ ...x })), imageData: p.imageData || "", batches: (p.batches || []).map((b) => ({ ...b })) }); }
  function buildSavedFields() {
    const batches = cleanBatches(form.batches);
    const base = { name: form.name, sku: form.sku, barcode: form.barcode, category: form.category || "সাধারণ", unit: form.unit || "পিস", purchasePrice: Number(form.purchasePrice) || 0, sellPrice: Number(form.sellPrice) || 0, wholesalePrice: Number(form.wholesalePrice) || 0, lowStockAt: Number(form.lowStockAt) || 5, detail: form.detail, genericName: form.genericName, dose: form.dose, requiresRx: !!form.requiresRx, isControlled: !!form.isControlled, isAntibiotic: !!form.isAntibiotic, isHighAlert: !!form.isHighAlert, favorite: !!form.favorite, allergyTags: form.allergyTags || "", interactionTags: form.interactionTags || "", manufacturer: form.manufacturer, dosageForm: form.dosageForm, storageInstruction: form.storageInstruction, rack: form.rack, reorderLevel: Number(form.reorderLevel) || 5, maxStock: Number(form.maxStock) || 0, unitOptions: (form.unitOptions || []).filter((x) => x.name && Number(x.factor) > 0).map((x) => ({ name: x.name.trim(), factor: Number(x.factor) })), imageData: form.imageData || "", batches };
    if (batches.length) return syncStockFromBatches({ ...base, stock: 0, expiry: "" });
    return { ...base, stock: Number(form.stock) || 0, expiry: form.expiry };
  }
  function saveEdit() {
    const fields = buildSavedFields();
    setProducts((prods) => prods.map((p) => (p.id === editing ? { ...p, ...fields } : p)));
    setEditing(null); pushToast("পণ্য আপডেট হয়েছে ✓");
    logActivity("product_edit", `${fields.name}`, { refId: editing });
  }
  function saveNew() {
    if (!form.name.trim()) return;
    const fields = buildSavedFields();
    const newId = uid();
    setProducts((p) => [...p, { id: newId, ...fields }]);
    setAdding(false); setForm(blank); pushToast("নতুন পণ্য যোগ হয়েছে ✓");
    logActivity("product_add", `${fields.name} — স্টক ${fields.stock} ${fields.unit}`, { refId: newId });
  }
  function del(id) {
    const p = products.find((x) => x.id === id);
    setProducts((prods) => prods.filter((x) => x.id !== id));
    pushToast("পণ্য মুছে ফেলা হয়েছে", "warn");
    logActivity("product_delete", `${p?.name || id}`, { refId: id });
  }
  function toggleExpand(id) { setExpanded((e) => ({ ...e, [id]: !e[id] })); }

  function downloadCsvTemplate() {
    const csv = toCSV(
      [{ name: "উদাহরণ প্যারাসিটামল ৫০০মিগ্রা", sku: "PARA-500", barcode: "8901234567890", category: "ওষুধ", unit: "স্ট্রিপ", stock: 50, purchasePrice: 20, sellPrice: 25, expiry: "2027-06-30" }],
      [
        { label: "নাম", value: "name" }, { label: "SKU", value: "sku" }, { label: "বারকোড", value: "barcode" },
        { label: "ক্যাটাগরি", value: "category" }, { label: "একক", value: "unit" }, { label: "স্টক", value: "stock" },
        { label: "ক্রয় মূল্য", value: "purchasePrice" }, { label: "বিক্রয় মূল্য", value: "sellPrice" }, { label: "মেয়াদ", value: "expiry" },
      ]
    );
    downloadTextFile("product-import-template.csv", csv, "text/csv");
  }
  function handleImportCSV(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let rows;
      try { rows = parseCSV(String(reader.result)); } catch (err) { pushToast("CSV ফাইলটা পড়া যায়নি — ফরম্যাট ঠিক আছে কিনা দেখুন।", "warn"); return; }
      if (!rows.length) { pushToast("ফাইলে কোনো ডেটা পাওয়া যায়নি।", "warn"); return; }
      let added = 0, updated = 0, skipped = 0;
      setProducts((prods) => {
        let next = [...prods];
        rows.forEach((raw) => {
          const m = mapCsvRowToProduct(raw);
          if (!m.name || !m.name.trim()) { skipped++; return; }
          const fields = {
            name: m.name.trim(), sku: (m.sku || "").trim(), barcode: (m.barcode || "").trim(),
            category: (m.category || "সাধারণ").trim(), unit: (m.unit || "পিস").trim(),
            stock: Number(m.stock) || 0, purchasePrice: Number(m.purchasePrice) || 0, sellPrice: Number(m.sellPrice) || 0,
            lowStockAt: Number(m.lowStockAt) || 5, expiry: m.expiry || "", genericName: (m.genericName || "").trim(),
            dose: (m.dose || "").trim(), detail: (m.detail || "").trim(),
          };
          // SKU বা বারকোড মিলে গেলে আগের পণ্য আপডেট হবে, নাহলে নতুন পণ্য হিসেবে যোগ হবে (একই ফাইল বারবার ইমপোর্ট করলে ডুপ্লিকেট হবে না)
          const existingIdx = next.findIndex((p) => (fields.sku && p.sku && p.sku.toLowerCase() === fields.sku.toLowerCase()) || (fields.barcode && p.barcode && p.barcode.toLowerCase() === fields.barcode.toLowerCase()));
          if (existingIdx >= 0) {
            const ex = next[existingIdx];
            next[existingIdx] = ex.batches && ex.batches.length ? { ...ex, purchasePrice: fields.purchasePrice || ex.purchasePrice, sellPrice: fields.sellPrice || ex.sellPrice } : { ...ex, ...fields, requiresRx: ex.requiresRx, batches: ex.batches || [] };
            updated++;
          } else {
            next.push({ id: uid(), requiresRx: false, batches: [], ...fields });
            added++;
          }
        });
        return next;
      });
      pushToast(`ইমপোর্ট সম্পন্ন — ${added} টি নতুন যোগ, ${updated} টি আপডেট${skipped ? `, ${skipped} টি সারি বাদ (নাম নেই)` : ""}`, "ok");
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const FormRow = ({ onSave, onCancel }) => (
    <div className="px-4 py-3" style={{ background: "#F3ECD8", borderBottom: "1px solid var(--rule-blue)" }}>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mb-2">
        <input className="field" placeholder="নাম" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="field" placeholder="SKU (ঐচ্ছিক)" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
        <input className="field" placeholder="বারকোড (স্ক্যান/টাইপ করুন, ঐচ্ছিক)" value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
        <input className="field" placeholder="ক্যাটাগরি" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
        <div>
          <input className="field" placeholder="একক" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} />
          <div className="flex flex-wrap gap-1 mt-1">{UNIT_CHIPS.map((u) => <button key={u} className="text-xs px-1.5 py-0.5" style={{ border: "1px solid var(--ink-faint)", color: "var(--ink-faint)" }} onClick={() => setForm({ ...form, unit: u })}>{u}</button>)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <div>
          <input type="number" className="field" placeholder="স্টক" value={form.batches.length ? form.batches.reduce((a, b) => a + (Number(b.qty) || 0), 0) : form.stock}
            disabled={form.batches.length > 0} onChange={(e) => setForm({ ...form, stock: e.target.value })} />
          {form.batches.length > 0 && <div className="text-xs mt-0.5" style={{ color: "var(--ink-faint)" }}>ব্যাচ থেকে অটো-হিসাব</div>}
        </div>
        <input type="number" className="field" placeholder="ক্রয় মূল্য" value={form.purchasePrice} onChange={(e) => setForm({ ...form, purchasePrice: e.target.value })} />
        <input type="number" className="field" placeholder="বিক্রয় মূল্য" value={form.sellPrice} onChange={(e) => setForm({ ...form, sellPrice: e.target.value })} />
        <input type="number" className="field" placeholder="Wholesale মূল্য" value={form.wholesalePrice} onChange={(e) => setForm({ ...form, wholesalePrice: e.target.value })} />
        <input type="number" className="field" placeholder="সতর্কতা পরিমাণ" value={form.lowStockAt} onChange={(e) => setForm({ ...form, lowStockAt: e.target.value })} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
        <input className="field" placeholder="জেনেরিক নাম (ঐচ্ছিক, ওষুধের জন্য)" value={form.genericName} onChange={(e) => setForm({ ...form, genericName: e.target.value })} />
        <input className="field" placeholder="ডোজ/পাওয়ার (যেমন: 500mg, ঐচ্ছিক)" value={form.dose} onChange={(e) => setForm({ ...form, dose: e.target.value })} />
        <input className="field" placeholder="প্রস্তুতকারক/কোম্পানি" value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} />
        <input className="field" placeholder="Dosage form (tablet/syrup)" value={form.dosageForm} onChange={(e) => setForm({ ...form, dosageForm: e.target.value })} />
        <input className="field" placeholder="Allergy tags (comma separated)" value={form.allergyTags} onChange={(e) => setForm({ ...form, allergyTags: e.target.value })} />
        <input className="field" placeholder="Interaction tags (comma separated)" value={form.interactionTags} onChange={(e) => setForm({ ...form, interactionTags: e.target.value })} />
        <label className="flex items-center gap-2 text-sm px-1" style={{ color: "var(--ink)" }}>
          <input type="checkbox" checked={!!form.requiresRx} onChange={(e) => setForm({ ...form, requiresRx: e.target.checked })} /> প্রেসক্রিপশন আবশ্যক
        </label>
        <label className="flex items-center gap-2 text-sm px-1"><input type="checkbox" checked={!!form.isAntibiotic} onChange={(e) => setForm({ ...form, isAntibiotic: e.target.checked })} /> অ্যান্টিবায়োটিক</label>
        <label className="flex items-center gap-2 text-sm px-1"><input type="checkbox" checked={!!form.isHighAlert} onChange={(e) => setForm({ ...form, isHighAlert: e.target.checked })} /> High-alert</label>
        <label className="flex items-center gap-2 text-sm px-1"><input type="checkbox" checked={!!form.favorite} onChange={(e) => setForm({ ...form, favorite: e.target.checked })} /> Quick sale favorite</label>
        <label className="flex items-center gap-2 text-sm px-1" style={{ color: "var(--stamp)" }}>
          <input type="checkbox" checked={!!form.isControlled} onChange={(e) => setForm({ ...form, isControlled: e.target.checked })} /> নিয়ন্ত্রিত ওষুধ
        </label>
        <div className="col-span-2 md:col-span-4 border p-2" style={{ borderColor: "var(--rule-blue)" }}>
          <div className="text-xs font-bold mb-1">ইউনিট কনভার্সন (বেস ইউনিট = {form.unit || "পিস"})</div>
          <div className="grid grid-cols-1 gap-1">{[0, 1, 2].map((idx) => <div key={idx} className="grid grid-cols-2 gap-2">
            <input className="field" placeholder={`ইউনিট ${idx + 1} (যেমন ${idx === 0 ? "স্ট্রিপ" : idx === 1 ? "বক্স" : "কার্টন"})`} value={form.unitOptions?.[idx]?.name || ""} onChange={(e) => { const u = [...(form.unitOptions || [])]; u[idx] = { name: e.target.value, factor: u[idx]?.factor || 1 }; setForm({ ...form, unitOptions: u }); }} />
            <input type="number" min="1" className="field" placeholder={`১ ইউনিটে কত ${form.unit || "পিস"}`} value={form.unitOptions?.[idx]?.factor || ""} onChange={(e) => { const u = [...(form.unitOptions || [])]; u[idx] = { name: u[idx]?.name || "", factor: e.target.value }; setForm({ ...form, unitOptions: u }); }} />
          </div>)}</div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <input className="field" placeholder="মডেল নং (ঐচ্ছিক)" value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} />
        <input className="field" placeholder="র‍্যাক/শেলফ" value={form.rack} onChange={(e) => setForm({ ...form, rack: e.target.value })} />
        <input className="field" placeholder="সংরক্ষণ নির্দেশনা" value={form.storageInstruction} onChange={(e) => setForm({ ...form, storageInstruction: e.target.value })} />
        <label className="text-xs flex items-center gap-2 border px-2 py-1" style={{ borderColor: "var(--rule-blue)" }}>পণ্যের ছবি
          <input type="file" accept="image/*" onChange={async (e) => { try { const imageData = await compressImageFile(e.target.files?.[0]); setForm({ ...form, imageData }); } catch { pushToast("ছবিটি পড়া যায়নি", "warn"); } }} />
        </label>
        <div>
          <input type="date" className="field" placeholder="মেয়াদ (ঐচ্ছিক)" value={form.batches.length ? "" : form.expiry} disabled={form.batches.length > 0} onChange={(e) => setForm({ ...form, expiry: e.target.value })} />
          {form.batches.length > 0 && <div className="text-xs mt-0.5" style={{ color: "var(--ink-faint)" }}>নিকটতম ব্যাচের মেয়াদ দেখাবে</div>}
        </div>
      </div>

      <div className="border-t pt-2 mt-1" style={{ borderColor: "var(--rule-blue)" }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-bold" style={{ color: "var(--ink-faint)" }}>ব্যাচ/লট-ভিত্তিক স্টক ও মেয়াদ (ঐচ্ছিক — একাধিক ব্যাচ থাকলে ব্যবহার করুন)</span>
          <button type="button" className="ledger-btn ledger-btn-sm flex items-center gap-1" onClick={() => setForm({ ...form, batches: [...form.batches, blankBatch()] })}><Plus size={12} /> ব্যাচ যোগ</button>
        </div>
        {form.batches.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {form.batches.map((b, idx) => (
              <div key={b.id} className="grid grid-cols-8 gap-2 items-center">
                <input className="field col-span-3" placeholder="ব্যাচ/লট নং" value={b.batchNo} onChange={(e) => setForm({ ...form, batches: form.batches.map((x, i) => i === idx ? { ...x, batchNo: e.target.value } : x) })} />
                <input type="date" className="field col-span-3" value={b.expiry} onChange={(e) => setForm({ ...form, batches: form.batches.map((x, i) => i === idx ? { ...x, expiry: e.target.value } : x) })} />
                <input type="number" className="field col-span-1" placeholder="পরিমাণ" value={b.qty} onChange={(e) => setForm({ ...form, batches: form.batches.map((x, i) => i === idx ? { ...x, qty: e.target.value } : x) })} />
                <button type="button" className="col-span-1 flex justify-center" onClick={() => setForm({ ...form, batches: form.batches.filter((_, i) => i !== idx) })}><Trash2 size={14} style={{ color: "var(--stamp)" }} /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 justify-end mt-2">
        <button className="ledger-btn ledger-btn-solid p-2" onClick={onSave}><Check size={16} /></button>
        <button className="ledger-btn p-2" onClick={onCancel}><X size={16} /></button>
      </div>
    </div>
  );

  return (
    <div>
      <SectionTitle icon={Boxes} right={
        <div className="flex flex-wrap gap-2 justify-end">
          <button className="ledger-btn ledger-btn-sm flex items-center gap-1" onClick={downloadCsvTemplate}><Download size={14} /> CSV টেমপ্লেট</button>
          <label className="ledger-btn ledger-btn-sm flex items-center gap-1 cursor-pointer"><UploadCloud size={14} /> CSV ইমপোর্ট<input type="file" accept=".csv,text/csv" className="hidden" onChange={handleImportCSV} /></label>
          <button className="ledger-btn ledger-btn-navy flex items-center gap-2" onClick={() => { setAdding(true); setForm(blank); }}><Plus size={16} /> নতুন পণ্য</button>
        </div>
      }>স্টক ও পণ্য তালিকা</SectionTitle>
      <p className="text-xs mb-3" style={{ color: "var(--ink-faint)" }}>একসাথে অনেক পণ্য যোগ করতে হলে "CSV টেমপ্লেট" ডাউনলোড করে Excel/Google Sheets-এ পূরণ করুন, তারপর "CSV ইমপোর্ট" দিয়ে আপলোড করুন। SKU বা বারকোড আগে থেকে থাকলে সেই পণ্য আপডেট হবে, নাহলে নতুন পণ্য যোগ হবে।</p>

      {lowStock.length > 0 && (
        <div className="border-2 p-3 mb-4" style={{ borderColor: "var(--stamp)", background: "#FBEAE7" }}>
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-2 font-bold" style={{ color: "var(--stamp)" }}><AlertTriangle size={16} /> স্টক অ্যালার্ট — {lowStock.length}টা পণ্যের স্টক কম</div>
            <button className="ledger-btn ledger-btn-sm flex items-center gap-1" onClick={() => setShowReorderPanel((v) => !v)}><Send size={13} /> {showReorderPanel ? "বন্ধ করুন" : "রি-অর্ডার তৈরি করুন"}</button>
          </div>
          {!showReorderPanel && (
            <div className="flex flex-wrap gap-2">
              {lowStock.map((p) => (
                <button key={p.id} className="px-3 py-1.5 text-sm" style={{ background: "#fff", borderLeft: "4px solid var(--stamp)", color: "var(--ink)" }} onClick={() => setQ(p.name)}>
                  {p.name} — মাত্র {p.stock} {p.unit}
                </button>
              ))}
            </div>
          )}
          {showReorderPanel && (
            <div className="bg-white p-3" style={{ border: "1px solid var(--rule-blue)" }}>
              <div className="text-xs mb-2" style={{ color: "var(--ink-faint)" }}>যেসব পণ্য অর্ডার করতে চান বেছে নিন, পরিমাণ দরকার হলে বদলে দিন (সাজেশন: সতর্কতা-সীমার দ্বিগুণ পর্যন্ত পৌঁছাতে যত লাগে)।</div>
              <div className="flex flex-col gap-1.5 mb-3">
                {lowStock.map((p) => (
                  <div key={p.id} className="grid grid-cols-12 items-center gap-2 text-sm">
                    <label className="col-span-7 flex items-center gap-2">
                      <input type="checkbox" checked={!!reorderSelected[p.id]} onChange={(e) => setReorderSelected((r) => ({ ...r, [p.id]: e.target.checked }))} />
                      {p.name} <span className="text-xs" style={{ color: "var(--ink-faint)" }}>(আছে {p.stock} {p.unit})</span>
                    </label>
                    <input type="number" className="field col-span-3" value={reorderQty[p.id] ?? suggestedQty(p)} onChange={(e) => setReorderQty((r) => ({ ...r, [p.id]: e.target.value }))} />
                    <span className="col-span-2 text-xs" style={{ color: "var(--ink-faint)" }}>{p.unit}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select className="field" style={{ maxWidth: 220 }} value={reorderSupplier} onChange={(e) => setReorderSupplier(e.target.value)}>
                  <option value="">সাপ্লায়ার (ঐচ্ছিক)</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button className="ledger-btn ledger-btn-navy flex items-center gap-2" onClick={createReorderPO}><Send size={15} /> অর্ডার তৈরি করুন (PO)</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mb-4 max-w-sm flex items-center gap-2 border-2 px-3 py-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        <Search size={16} style={{ color: "var(--ink-faint)" }} /><input className="field" style={{ borderBottom: "none" }} placeholder="পণ্য, SKU বা জেনেরিক নাম খুঁজুন…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <p className="text-xs mb-4" style={{ color: "var(--ink-faint)" }}>একই ওষুধের ভিন্ন ভিন্ন ব্যাচের মেয়াদ আলাদা হলে, পণ্য যোগ/এডিট করার সময় নিচের &ldquo;ব্যাচ/লট-ভিত্তিক স্টক ও মেয়াদ&rdquo; অংশ ব্যবহার করুন — একাধিক ব্যাচ যোগ করলে মোট স্টক ও সবচেয়ে কাছের মেয়াদ অটো-হিসাব হবে। ব্যাচ দরকার না হলে সরাসরি স্টক/মেয়াদ ঘরেই লিখুন।</p>

      <div className="border-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        <div className="hidden md:grid grid-cols-8 px-4 py-2 text-sm font-bold" style={{ borderBottom: "2px solid var(--ink)", color: "var(--ink-faint)" }}>
          <div className="col-span-2">নাম</div><div>ক্যাটাগরি</div><div className="text-center">স্টক</div><div className="text-right">ক্রয়</div><div className="text-right">বিক্রয়</div><div>মেয়াদ</div><div className="text-right">অ্যাকশন</div>
        </div>
        {adding && <FormRow onSave={saveNew} onCancel={() => setAdding(false)} />}
        {filtered.length === 0 && !adding && <div className="p-4 text-sm" style={{ color: "var(--ink-faint)" }}>কোনো পণ্য পাওয়া যায়নি।</div>}
        {filtered.map((p) => editing === p.id ? (
          <FormRow key={p.id} onSave={saveEdit} onCancel={() => setEditing(null)} />
        ) : (
          <div key={p.id} style={{ borderBottom: "1px solid var(--rule-blue)" }}>
            <div className="grid grid-cols-2 md:grid-cols-8 px-4 py-3 items-center gap-1">
              <div className="col-span-2 md:col-span-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span style={{ fontWeight: 600 }}>{p.name}</span>{p.imageData && <button title="পণ্যের ছবি দেখুন" onClick={() => setPreviewImage({ src: p.imageData, title: p.name })}><img src={p.imageData} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4, border: "1px solid var(--rule-blue)" }} /></button>}
                  {p.stock <= (p.lowStockAt ?? 5) && <AlertTriangle size={14} style={{ color: "var(--stamp)" }} />}
                  {p.requiresRx && <span className="text-xs px-1.5 py-0.5 font-bold" style={{ background: "var(--tab-navy)", color: "#fff" }}>Rx</span>}{p.isControlled && <span className="text-xs px-1.5 py-0.5 font-bold" style={{ background: "var(--stamp)", color: "#fff" }}>নিয়ন্ত্রিত</span>}{p.isAntibiotic && <span className="text-xs px-1.5 py-0.5 font-bold" style={{ background: "#8B5CF6", color: "#fff" }}>অ্যান্টিবায়োটিক</span>}
                  {p.batches && p.batches.length > 0 && (
                    <button className="text-xs px-1.5 py-0.5" style={{ border: "1px solid var(--gold)", color: "var(--gold)" }} onClick={() => toggleExpand(p.id)}>{p.batches.length} ব্যাচ {expanded[p.id] ? "▲" : "▼"}</button>
                  )}
                </div>
                <div className="text-xs" style={{ color: "var(--ink-faint)" }}>{[p.genericName && p.dose ? `${p.genericName} ${p.dose}` : p.genericName || p.dose, p.sku, p.barcode, p.detail].filter(Boolean).join(" • ")}</div>
              </div>
              <div className="text-sm" style={{ color: "var(--ink-faint)" }}>{p.category}</div>
              <div className="text-center" style={{ color: p.stock <= (p.lowStockAt ?? 5) ? "var(--stamp)" : "var(--ink)", fontWeight: 700 }}>{p.stock} {p.unit}</div>
              <div className="text-right">{money(p.purchasePrice)}</div>
              <div className="text-right font-bold">{money(p.sellPrice)}</div>
              <div className="text-sm" style={{ color: p.expiry && daysBetween(p.expiry) <= 30 ? "var(--stamp)" : "var(--ink-faint)" }}>{p.expiry ? bnDate(p.expiry) : "-"}</div>
              <div className="text-right flex gap-2 justify-end">
                <button title="বারকোড লেবেল প্রিন্ট" onClick={() => onPrintLabel(p)}><Printer size={16} style={{ color: "var(--ink)" }} /></button>
                <button title="নষ্ট/ক্ষতি হিসেবে বাদ দিন" onClick={() => setWriteOffTarget({ product: p, batch: null })} disabled={p.stock <= 0}><Ban size={16} style={{ color: p.stock > 0 ? "var(--stamp)" : "var(--ink-faint)" }} /></button>
                <button title="স্টক সমন্বয়" onClick={() => setAdjustTarget(p)}><RotateCcw size={16} style={{ color: "var(--tab-navy)" }} /></button>
                <button onClick={() => startEdit(p)}><Pencil size={16} style={{ color: "var(--ink)" }} /></button>
                <button onClick={() => del(p.id)}><Trash2 size={16} style={{ color: "var(--stamp)" }} /></button>
              </div>
            </div>
            {expanded[p.id] && p.batches && p.batches.length > 0 && (
              <div className="px-4 pb-3 -mt-1">
                <div className="border" style={{ borderColor: "var(--rule-blue)" }}>
                  {[...p.batches].sort((a, b) => (a.expiry || "9999-99-99").localeCompare(b.expiry || "9999-99-99")).map((b, i) => {
                    const d = b.expiry ? daysBetween(b.expiry) : null;
                    const warn = d !== null && d <= 30;
                    return (
                      <div key={b.id} className="grid grid-cols-4 px-3 py-1.5 text-sm items-center" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
                        <div>{b.batchNo || "(নাম নেই)"}</div>
                        <div style={{ color: warn ? "var(--stamp)" : "var(--ink-faint)" }}>{b.expiry ? `${bnDate(b.expiry)}${d < 0 ? " (মেয়াদ শেষ)" : ""}` : "মেয়াদ নেই"}</div>
                        <div className="text-right">{b.qty} {p.unit}</div>
                        <div className="text-right"><button title="এই ব্যাচ নষ্ট/ক্ষতি হিসেবে বাদ দিন" onClick={() => setWriteOffTarget({ product: p, batch: b })}><Ban size={14} style={{ color: "var(--stamp)" }} /></button></div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      {writeOffTarget && <WriteOffModal target={writeOffTarget} onClose={() => setWriteOffTarget(null)} onSubmit={submitWriteOff} />}
      {adjustTarget && <StockAdjustModal product={adjustTarget} onClose={() => setAdjustTarget(null)} onSubmit={submitAdjustment} />}
      {previewImage && <ImagePreviewModal src={previewImage.src} title={previewImage.title} onClose={() => setPreviewImage(null)} />}
    </div>
  );
}

function StockAdjustModal({ product, onClose, onSubmit }) {
  const [qty, setQty] = useState(""); const [reason, setReason] = useState("");
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(33,38,31,.55)" }}><div className="w-full max-w-sm p-5" style={{ background: "#fff" }}><div className="font-bold mb-3">স্টক সমন্বয় — {product.name}</div><div className="text-sm mb-2">বর্তমান স্টক: {product.stock} {product.unit}</div><input type="number" className="field mb-2" placeholder="পরিমাণ (+ যোগ / - বাদ)" value={qty} onChange={(e) => setQty(e.target.value)} /><input className="field mb-3" placeholder="কারণ" value={reason} onChange={(e) => setReason(e.target.value)} /><div className="flex gap-2"><button className="ledger-btn flex-1" onClick={onClose}>বাতিল</button><button className="ledger-btn ledger-btn-solid flex-1" onClick={() => Number(qty) && onSubmit({ product, qty: Number(qty), reason })}>সেভ</button></div></div></div>;
}

// ---------- নষ্ট/ক্ষতি (write-off) মডাল ----------
function WriteOffModal({ target, onClose, onSubmit }) {
  const { product, batch } = target;
  const maxQty = batch ? batch.qty : product.stock;
  const [qty, setQty] = useState(String(maxQty));
  const [reason, setReason] = useState(batch && batch.expiry && daysBetween(batch.expiry) < 0 ? "মেয়াদ শেষ" : "");
  const REASONS = ["মেয়াদ শেষ", "ভেঙে/নষ্ট হয়ে গেছে", "চুরি/হারিয়ে গেছে", "গুণগত মান খারাপ", "অন্যান্য"];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(33,38,31,0.55)" }}>
      <div className="w-full max-w-sm" style={{ background: "#fff", color: "#111", fontFamily: "var(--font-body)" }}>
        <div className="p-5">
          <div className="flex items-center gap-2 mb-3" style={{ fontWeight: 900, fontSize: 18 }}><Ban size={20} style={{ color: "#A93226" }} /> নষ্ট/ক্ষতি হিসেবে বাদ দিন</div>
          <div className="text-sm mb-3">
            <div style={{ fontWeight: 700 }}>{product.name}</div>
            {batch && <div className="text-xs" style={{ color: "#666" }}>ব্যাচ: {batch.batchNo || "(নাম নেই)"}{batch.expiry ? ` • মেয়াদ: ${bnDate(batch.expiry)}` : ""}</div>}
            <div className="text-xs" style={{ color: "#666" }}>বর্তমানে আছে: {maxQty} {product.unit}</div>
          </div>
          <div className="mb-3">
            <label className="text-xs block mb-1" style={{ color: "#666" }}>কী পরিমাণ বাদ দেবেন</label>
            <input type="number" min="0" max={maxQty} className="field" value={qty} onChange={(e) => setQty(e.target.value)} />
          </div>
          <div className="mb-3">
            <label className="text-xs block mb-1" style={{ color: "#666" }}>কারণ</label>
            <select className="field" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">বেছে নিন</option>
              {REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="text-xs mb-3" style={{ color: "#A93226" }}>ক্ষতির আনুমানিক মূল্য: {money(Math.min(Number(qty) || 0, maxQty) * (product.purchasePrice || 0))} (ক্রয় মূল্য অনুযায়ী)</div>
          <div className="flex gap-2">
            <button className="ledger-btn flex-1" onClick={onClose}>বাতিল</button>
            <button className="ledger-btn ledger-btn-solid flex-1 justify-center" style={{ background: "#A93226", borderColor: "#A93226" }}
              onClick={() => onSubmit({ product, batch, qty: Number(qty) || 0, reason })}>বাদ দিন</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Customers tab ----------
function CustomersTab({ customers, setCustomers, sales, payments, setPayments, pushToast, onPrint, shopName, logActivity = () => {} }) {
  const [openId, setOpenId] = useState(null);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [opening, setOpening] = useState(""); const [allergies, setAllergies] = useState(""); const [group, setGroup] = useState("Retail");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("ক্যাশ");
  const [txnNo, setTxnNo] = useState("");
  const [bankAccNo, setBankAccNo] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const { needsTxn, needsBankAcc, needsSenderNumber } = payMethodFlags(payMethod);
  const selected = customers.find((c) => c.id === openId);
  const dueReminderMsg = (c, due) => `প্রিয় ${c.name}, ${shopName}-এ আপনার বর্তমান বাকি ${money(due)}। সম্ভব হলে দ্রুত পরিশোধ করার অনুরোধ রইলো। ধন্যবাদ — ${shopName}`;

  if (selected) {
    const due = customerDue(selected.id, sales, payments, customers);
    const history = sales.filter((s) => s.customerId === selected.id).sort((a, b) => b.createdAt - a.createdAt);
    const paymentsList = payments.filter((p) => p.type === "customer" && p.partyId === selected.id).sort((a, b) => b.date.localeCompare(a.date));
    return (
      <div>
        <button className="flex items-center gap-1 mb-4 text-sm" style={{ color: "var(--ink-faint)" }} onClick={() => setOpenId(null)}><ArrowLeft size={14} /> কাস্টমার তালিকায় ফিরে যান</button>
        <SectionTitle icon={UserRound}>{selected.name}</SectionTitle>
        {selected.phone && <div className="flex items-center gap-1 mb-4 text-sm" style={{ color: "var(--ink-faint)" }}><Phone size={13} /> {selected.phone}</div>}
        {(selected.allergies || selected.group) && <div className="text-xs mb-4" style={{color:"var(--stamp)"}}>Group: {selected.group || "Retail"}{selected.allergies ? ` • Allergy: ${selected.allergies}` : ""}</div>}
        <div className="grid grid-cols-2 gap-3 mb-4 max-w-md">
          <StatCard label="মোট বাকি (পাওনা)" value={money(due)} icon={Wallet} tone={due > 0 ? "red" : "green"} />
          <StatCard label="মোট কেনাকাটা" value={money(history.reduce((a, s) => a + s.total, 0))} icon={ShoppingCart} />
        </div>
        {due > 0 && selected.phone && (
          <div className="flex gap-2 mb-6 max-w-md">
            <a href={waLink(selected.phone, dueReminderMsg(selected, due))} target="_blank" rel="noopener noreferrer" className="ledger-btn flex items-center gap-2 flex-1 justify-center" style={{ borderColor: "#25D366", color: "#128C4A" }}><MessageCircle size={16} /> WhatsApp রিমাইন্ডার</a>
            <a href={smsLink(selected.phone, dueReminderMsg(selected, due))} className="ledger-btn flex items-center gap-2 flex-1 justify-center"><MessageSquare size={16} /> SMS রিমাইন্ডার</a>
          </div>
        )}
        {due > 0 && (
          <div className="border-2 p-4 mb-6 max-w-md" style={{ borderColor: "var(--gold)", background: "var(--paper)" }}>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>পাওনা আদায় করুন</label><input type="number" className="field" placeholder={String(due)} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
              <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>পেমেন্ট মাধ্যম</label>
                <select className="field" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            {(needsTxn || needsBankAcc || needsSenderNumber) && (
              <div className="grid grid-cols-2 gap-2 mb-2">
                {needsSenderNumber && <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>প্রেরকের নম্বর</label><input className="field" value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} placeholder="যেমন: 017XXXXXXXX" /></div>}
                {needsTxn && <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>ট্রানজেকশন আইডি</label><input className="field" value={txnNo} onChange={(e) => setTxnNo(e.target.value)} placeholder="যেমন: TXN12345" /></div>}
                {needsBankAcc && <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>ব্যাংক অ্যাকাউন্ট নং</label><input className="field" value={bankAccNo} onChange={(e) => setBankAccNo(e.target.value)} placeholder="অ্যাকাউন্ট নম্বর" /></div>}
              </div>
            )}
            <button className="ledger-btn ledger-btn-solid w-full justify-center" onClick={() => { const amt = Math.min(due, Math.max(0, Number(payAmount) || due)); if (amt <= 0) return; setPayments((p) => [...p, { id: uid(), type: "customer", partyId: selected.id, amount: amt, date: todayStr(), payMethod, txnNo: needsTxn ? txnNo.trim() : "", bankAccNo: needsBankAcc ? bankAccNo.trim() : "", senderNumber: needsSenderNumber ? senderNumber.trim() : "" }]); setPayAmount(""); setTxnNo(""); setBankAccNo(""); setSenderNumber(""); pushToast("পেমেন্ট রেকর্ড হয়েছে ✓"); logActivity("customer_payment", `${selected.name} থেকে ${money(amt)} আদায় (${payMethod})`, { refId: selected.id }); }}>জমা নিন</button>
          </div>
        )}
        <SectionTitle icon={FileBarChart}>কেনাকাটার ইতিহাস</SectionTitle>
        <div className="border-2 mb-6" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          {history.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--ink-faint)" }}>কোনো লেনদেন নেই।</div>}
          {history.map((s, i) => (
            <div key={s.id} className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
              <div><span style={{ fontWeight: 600 }}>#{s.invoiceNo}</span> <span className="text-xs" style={{ color: "var(--ink-faint)" }}>{bnDate(s.date)}</span></div>
              <div className="flex items-center gap-3"><span style={{ fontWeight: 700 }}>{money(s.total)}</span>{s.due > 0 && <span className="text-xs" style={{ color: "var(--stamp)" }}>বাকি {money(s.due)}</span>}<button className="ledger-btn p-1.5" onClick={() => onPrint(s)}><Printer size={14} /></button></div>
            </div>
          ))}
        </div>
        {paymentsList.length > 0 && (
          <><SectionTitle icon={Wallet}>পাওনা আদায়ের হিসাব</SectionTitle>
          <div className="border-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
            {paymentsList.map((p, i) => (<div key={p.id} className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}><div><span className="text-sm" style={{ color: "var(--ink-faint)" }}>{bnDate(p.date)}</span>{p.payMethod && p.payMethod !== "ক্যাশ" && <div className="text-xs" style={{ color: "var(--ink-faint)" }}>{p.payMethod}{p.senderNumber ? ` • প্রেরক: ${p.senderNumber}` : ""}{p.txnNo ? ` • ট্রানজেকশন: ${p.txnNo}` : ""}{p.bankAccNo ? ` • অ্যাকাউন্ট: ${p.bankAccNo}` : ""}</div>}</div><span style={{ fontWeight: 700, color: "var(--green)" }}>+{money(p.amount)}</span></div>))}
          </div></>
        )}
      </div>
    );
  }

  return (
    <div>
      <SectionTitle icon={UserRound}>কাস্টমার ও বাকির খাতা</SectionTitle>
      <div className="border-2 mb-6" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        {customers.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--ink-faint)" }}>এখনো কোনো কাস্টমার যোগ করা হয়নি।</div>}
        {customers.map((c, i) => {
          const due = customerDue(c.id, sales, payments, customers);
          return (
            <div key={c.id} className="w-full flex items-center justify-between px-4 py-3" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
              <button onClick={() => setOpenId(c.id)} className="text-left flex-1">
                <div style={{ fontWeight: 600 }}>{c.name}</div>{c.phone && <div className="text-xs" style={{ color: "var(--ink-faint)" }}>{c.phone}</div>}
              </button>
              <div className="flex items-center gap-3">
                {due > 0 ? <span style={{ color: "var(--stamp)", fontWeight: 700 }}>বাকি {money(due)}</span> : <span style={{ color: "var(--green)" }}>পরিশোধিত</span>}
                {due > 0 && c.phone && (
                  <>
                    <a href={waLink(c.phone, dueReminderMsg(c, due))} target="_blank" rel="noopener noreferrer" title="WhatsApp রিমাইন্ডার" onClick={(e) => e.stopPropagation()}><MessageCircle size={16} style={{ color: "#128C4A" }} /></a>
                    <a href={smsLink(c.phone, dueReminderMsg(c, due))} title="SMS রিমাইন্ডার" onClick={(e) => e.stopPropagation()}><MessageSquare size={16} style={{ color: "var(--ink-faint)" }} /></a>
                  </>
                )}
                <button onClick={() => setOpenId(c.id)}><ChevronRight size={16} style={{ color: "var(--ink-faint)" }} /></button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-2 max-w-lg p-4 grid grid-cols-3 gap-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        <input className="field" placeholder="নাম" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field" placeholder="ফোন নম্বর" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input type="number" className="field" placeholder="আগের বাকি (ঐচ্ছিক)" value={opening} onChange={(e) => setOpening(e.target.value)} />
        <input className="field" placeholder="Allergy (comma separated)" value={allergies} onChange={(e) => setAllergies(e.target.value)} />
        <select className="field" value={group} onChange={(e)=>setGroup(e.target.value)}><option>Retail</option><option>Wholesale</option><option>VIP</option></select>
        <button className="ledger-btn ledger-btn-navy col-span-3" onClick={() => { if (!name.trim()) return; setCustomers((c) => [...c, { id: uid(), name: name.trim(), phone: phone.trim(), address: "", allergies: allergies.trim(), group, openingBalance: Number(opening) || 0, createdAt: Date.now() }]); setName(""); setPhone(""); setOpening(""); setAllergies(""); setGroup("Retail"); pushToast("কাস্টমার যোগ হয়েছে ✓"); }}>যোগ করুন</button>
      </div>
    </div>
  );
}

// ---------- Suppliers tab ----------
function SuppliersTab({ suppliers, setSuppliers, purchases, payments, setPayments, pushToast, onPrint, logActivity = () => {} }) {
  const [openId, setOpenId] = useState(null);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [opening, setOpening] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("ক্যাশ");
  const [txnNo, setTxnNo] = useState("");
  const [bankAccNo, setBankAccNo] = useState("");
  const [senderNumber, setSenderNumber] = useState("");
  const { needsTxn, needsBankAcc, needsSenderNumber } = payMethodFlags(payMethod);
  const selected = suppliers.find((s) => s.id === openId);

  if (selected) {
    const due = supplierDue(selected.id, purchases, payments, suppliers);
    const history = purchases.filter((p) => p.supplierId === selected.id).sort((a, b) => b.createdAt - a.createdAt);
    const paymentsList = payments.filter((p) => p.type === "supplier" && p.partyId === selected.id).sort((a, b) => b.date.localeCompare(a.date));
    return (
      <div>
        <button className="flex items-center gap-1 mb-4 text-sm" style={{ color: "var(--ink-faint)" }} onClick={() => setOpenId(null)}><ArrowLeft size={14} /> সাপ্লায়ার তালিকায় ফিরে যান</button>
        <SectionTitle icon={Truck}>{selected.name}</SectionTitle>
        {selected.phone && <div className="flex items-center gap-1 mb-4 text-sm" style={{ color: "var(--ink-faint)" }}><Phone size={13} /> {selected.phone}</div>}
        <div className="grid grid-cols-2 gap-3 mb-6 max-w-md">
          <StatCard label="মোট দেনা" value={money(due)} icon={Wallet} tone={due > 0 ? "red" : "green"} />
          <StatCard label="মোট ক্রয়" value={money(history.reduce((a, p) => a + p.total, 0))} icon={PackagePlus} />
        </div>
        {due > 0 && (
          <div className="border-2 p-4 mb-6 max-w-md" style={{ borderColor: "var(--gold)", background: "var(--paper)" }}>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>দেনা পরিশোধ করুন</label><input type="number" className="field" placeholder={String(due)} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} /></div>
              <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>পেমেন্ট মাধ্যম</label>
                <select className="field" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                  {PAY_METHODS.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            {(needsTxn || needsBankAcc || needsSenderNumber) && (
              <div className="grid grid-cols-2 gap-2 mb-2">
                {needsSenderNumber && <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>প্রেরকের নম্বর</label><input className="field" value={senderNumber} onChange={(e) => setSenderNumber(e.target.value)} placeholder="যেমন: 017XXXXXXXX" /></div>}
                {needsTxn && <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>ট্রানজেকশন আইডি</label><input className="field" value={txnNo} onChange={(e) => setTxnNo(e.target.value)} placeholder="যেমন: TXN12345" /></div>}
                {needsBankAcc && <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>ব্যাংক অ্যাকাউন্ট নং</label><input className="field" value={bankAccNo} onChange={(e) => setBankAccNo(e.target.value)} placeholder="অ্যাকাউন্ট নম্বর" /></div>}
              </div>
            )}
            <button className="ledger-btn ledger-btn-navy w-full justify-center" onClick={() => { const amt = Math.min(due, Math.max(0, Number(payAmount) || due)); if (amt <= 0) return; setPayments((p) => [...p, { id: uid(), type: "supplier", partyId: selected.id, amount: amt, date: todayStr(), payMethod, txnNo: needsTxn ? txnNo.trim() : "", bankAccNo: needsBankAcc ? bankAccNo.trim() : "", senderNumber: needsSenderNumber ? senderNumber.trim() : "" }]); setPayAmount(""); setTxnNo(""); setBankAccNo(""); setSenderNumber(""); pushToast("পেমেন্ট রেকর্ড হয়েছে ✓"); logActivity("supplier_payment", `${selected.name} কে ${money(amt)} পরিশোধ (${payMethod})`, { refId: selected.id }); }}>পরিশোধ করুন</button>
          </div>
        )}
        <SectionTitle icon={FileBarChart}>ক্রয়ের ইতিহাস</SectionTitle>
        <div className="border-2 mb-6" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          {history.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--ink-faint)" }}>কোনো লেনদেন নেই।</div>}
          {history.map((p, i) => (
            <div key={p.id} className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
              <div><span style={{ fontWeight: 600 }}>{p.items.map((it) => it.name).join(", ")}</span> <span className="text-xs" style={{ color: "var(--ink-faint)" }}>{bnDate(p.date)}</span></div>
              <div className="flex items-center gap-3"><span style={{ fontWeight: 700 }}>{money(p.total)}</span>{p.due > 0 && <span className="text-xs" style={{ color: "var(--stamp)" }}>বাকি {money(p.due)}</span>}<button className="ledger-btn p-1.5" title="স্লিপ প্রিন্ট করুন" onClick={() => onPrint(p)}><Printer size={14} /></button></div>
            </div>
          ))}
        </div>
        {paymentsList.length > 0 && (
          <><SectionTitle icon={Wallet}>দেনা পরিশোধের হিসাব</SectionTitle>
          <div className="border-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
            {paymentsList.map((p, i) => (<div key={p.id} className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}><div><span className="text-sm" style={{ color: "var(--ink-faint)" }}>{bnDate(p.date)}</span>{p.payMethod && p.payMethod !== "ক্যাশ" && <div className="text-xs" style={{ color: "var(--ink-faint)" }}>{p.payMethod}{p.senderNumber ? ` • প্রেরক: ${p.senderNumber}` : ""}{p.txnNo ? ` • ট্রানজেকশন: ${p.txnNo}` : ""}{p.bankAccNo ? ` • অ্যাকাউন্ট: ${p.bankAccNo}` : ""}</div>}</div><span style={{ fontWeight: 700, color: "var(--stamp)" }}>-{money(p.amount)}</span></div>))}
          </div></>
        )}
      </div>
    );
  }

  return (
    <div>
      <SectionTitle icon={Truck}>সাপ্লায়ারের খাতা</SectionTitle>
      <div className="border-2 mb-6" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        {suppliers.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--ink-faint)" }}>এখনো কোনো সাপ্লায়ার যোগ করা হয়নি।</div>}
        {suppliers.map((s, i) => {
          const due = supplierDue(s.id, purchases, payments, suppliers);
          return (
            <button key={s.id} onClick={() => setOpenId(s.id)} className="w-full flex items-center justify-between px-4 py-3 text-left" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
              <div><div style={{ fontWeight: 600 }}>{s.name}</div>{s.phone && <div className="text-xs" style={{ color: "var(--ink-faint)" }}>{s.phone}</div>}</div>
              <div className="flex items-center gap-3">{due > 0 ? <span style={{ color: "var(--stamp)", fontWeight: 700 }}>দেনা {money(due)}</span> : <span style={{ color: "var(--green)" }}>পরিশোধিত</span>}<ChevronRight size={16} style={{ color: "var(--ink-faint)" }} /></div>
            </button>
          );
        })}
      </div>
      <div className="border-2 max-w-lg p-4 grid grid-cols-3 gap-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        <input className="field" placeholder="নাম" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="field" placeholder="ফোন নম্বর" value={phone} onChange={(e) => setPhone(e.target.value)} />
        <input type="number" className="field" placeholder="আগের দেনা (ঐচ্ছিক)" value={opening} onChange={(e) => setOpening(e.target.value)} />
        <button className="ledger-btn ledger-btn-navy col-span-3" onClick={() => { if (!name.trim()) return; setSuppliers((s) => [...s, { id: uid(), name: name.trim(), phone: phone.trim(), address: "", openingBalance: Number(opening) || 0, createdAt: Date.now() }]); setName(""); setPhone(""); setOpening(""); pushToast("সাপ্লায়ার যোগ হয়েছে ✓"); }}>যোগ করুন</button>
      </div>
    </div>
  );
}

// ---------- Expenses tab ----------
function ExpensesTab({ expenses, setExpenses, currentUser, pushToast, logActivity = () => {} }) {
  const [title, setTitle] = useState(""); const [amount, setAmount] = useState(""); const [note, setNote] = useState("");
  const total = expenses.reduce((a, e) => a + e.amount, 0);
  const monthTotal = expenses.filter((e) => e.date.slice(0, 7) === todayStr().slice(0, 7)).reduce((a, e) => a + e.amount, 0);
  return (
    <div>
      <SectionTitle icon={Wallet}>দোকানের খরচ</SectionTitle>
      <div className="grid grid-cols-2 gap-3 mb-6 max-w-md">
        <StatCard label="এই মাসের খরচ" value={money(monthTotal)} icon={Wallet} tone="red" />
        <StatCard label="সর্বমোট খরচ" value={money(total)} icon={Wallet} />
      </div>
      <div className="border-2 max-w-2xl p-4 grid grid-cols-1 md:grid-cols-4 gap-2 mb-6" style={{ borderColor: "var(--gold)", background: "var(--paper)" }}>
        <input className="field" placeholder="খরচের নাম (যেমন: বিদ্যুৎ বিল)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input type="number" className="field" placeholder="টাকার পরিমাণ" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <input className="field" placeholder="নোট (ঐচ্ছিক)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="ledger-btn ledger-btn-solid" onClick={() => {
          if (!title.trim() || !Number(amount)) return;
          setExpenses((e) => [{ id: uid(), title: title.trim(), amount: Number(amount), note, date: todayStr(), createdAt: Date.now(), addedBy: currentUser.name }, ...e]);
          setTitle(""); setAmount(""); setNote(""); pushToast("খরচ যোগ হয়েছে ✓");
          logActivity("expense_add", `${title.trim()} — ${money(Number(amount))}`);
        }}>যোগ করুন</button>
      </div>
      <div className="border-2 max-w-2xl" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        {expenses.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--ink-faint)" }}>এখনো কোনো খরচ যোগ করা হয়নি।</div>}
        {expenses.map((e, i) => (
          <div key={e.id} className="flex items-center justify-between px-4 py-2.5" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
            <div><div style={{ fontWeight: 600 }}>{e.title}</div><div className="text-xs" style={{ color: "var(--ink-faint)" }}>{bnDate(e.date)} {e.note && `• ${e.note}`}</div></div>
            <div className="flex items-center gap-2">
              <span style={{ fontWeight: 700, color: "var(--stamp)" }}>-{money(e.amount)}</span>
              <button onClick={() => setExpenses((ex) => ex.filter((x) => x.id !== e.id))}><Trash2 size={15} style={{ color: "var(--stamp)" }} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Reports tab ----------
function ReportsTab({ sales, purchases, products, expenses, writeOffs = [] }) {
  const [previewImage, setPreviewImage] = useState(null);
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(todayStr());
  const inRange = (d) => d >= from && d <= to;
  const salesR = sales.filter((s) => inRange(s.date));
  const purchR = purchases.filter((p) => inRange(p.date));
  const expR = expenses.filter((e) => inRange(e.date));
  const writeOffR = writeOffs.filter((w) => inRange(w.date));

  const totalSales = salesR.reduce((a, s) => a + s.total, 0);
  const totalPurch = purchR.reduce((a, p) => a + p.total, 0);
  const totalDiscount = salesR.reduce((a, s) => a + (s.discount || 0), 0);
  const totalShipping = salesR.reduce((a, s) => a + (s.shipping || 0), 0);
  const totalExpense = expR.reduce((a, e) => a + e.amount, 0);
  const totalWriteOff = writeOffR.reduce((a, w) => a + (w.lossValue || 0), 0);
  const saleDue = salesR.reduce((a, s) => a + (s.due || 0), 0);
  const purchDue = purchR.reduce((a, p) => a + (p.due || 0), 0);

  const grossProfit = (salesR.reduce((a, s) => a + (s.subtotal ?? s.total), 0)) - purchR.reduce((a, p) => a + (p.subtotal ?? p.total), 0);
  const netProfit = grossProfit + totalShipping - totalDiscount - totalExpense - totalWriteOff;
  const closingStockValue = products.reduce((a, p) => a + p.stock * p.sellPrice, 0);
  const closingStockCost = products.reduce((a, p) => a + p.stock * p.purchasePrice, 0);

  const byProduct = {};
  salesR.forEach((s) => s.items.forEach((it) => {
    byProduct[it.name] = byProduct[it.name] || { name: it.name, qty: 0, revenue: 0, cost: 0 };
    byProduct[it.name].qty += it.qty; byProduct[it.name].revenue += it.qty * it.price;
    const prod = products.find((p) => p.id === it.productId);
    byProduct[it.name].cost += it.qty * (prod?.purchasePrice || 0);
  }));
  const rankedProducts = Object.values(byProduct).sort((a, b) => b.qty - a.qty);
  const topProducts = rankedProducts.slice(0, 8);
  const slowProducts = products.filter((p) => !byProduct[p.name]).map((p) => ({ name: p.name, qty: 0, stock: p.stock })).concat(rankedProducts.filter((x) => x.qty > 0).sort((a, b) => a.qty - b.qty).slice(0, 8));
  const controlledSales = salesR.filter((x) => x.controlledRegister);

  const byDay = {};
  salesR.forEach((s) => { byDay[s.date] = (byDay[s.date] || 0) + s.total; });
  const chartData = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).map(([date, total]) => ({ date: date.slice(5), total }));

  return (
    <div>
      <SectionTitle icon={FileBarChart} right={<a className="ledger-btn ledger-btn-sm flex items-center gap-1" style={{ borderColor: "#25D366", color: "#128C4A" }} href={waShareLink(`দৈনিক সামারি — ${bnDate(todayStr())}\nবিক্রয়: ${money(sales.filter((x) => x.date === todayStr()).reduce((a, x) => a + x.total, 0))}\nইনভয়েস: ${sales.filter((x) => x.date === todayStr()).length}\nক্রয়: ${money(purchases.filter((x) => x.date === todayStr()).reduce((a, x) => a + x.total, 0))}`)} target="_blank" rel="noopener noreferrer"><MessageCircle size={14} /> দৈনিক WhatsApp সামারি</a>}>রিপোর্ট</SectionTitle>
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>শুরু</label><input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>শেষ</label><input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} /></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="মোট বিক্রয়" value={money(totalSales)} icon={TrendingUp} tone="green" />
        <StatCard label="মোট ক্রয়" value={money(totalPurch)} icon={TrendingDown} tone="red" />
        <StatCard label="মোট খরচ" value={money(totalExpense)} icon={Wallet} tone="red" />
        <StatCard label="নেট প্রফিট" value={money(netProfit)} icon={Wallet} tone={netProfit >= 0 ? "gold" : "red"} />
      </div>

      {chartData.length > 0 && (
        <div className="border-2 p-4 mb-8" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          <div className="mb-3 font-bold" style={{ color: "var(--ink)" }}>দৈনিক বিক্রয়</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--rule-blue)" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} />
              <Tooltip formatter={(v) => money(v)} /><Bar dataKey="total" fill="#A93226" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <SectionTitle icon={Wallet}>লাভ-ক্ষতির হিসাব (Profit / Loss)</SectionTitle>
      <div className="grid md:grid-cols-2 gap-4 mb-3">
        <div className="border-2 p-4" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          <Row label="মোট বিক্রয় (সাবটোটাল)" value={money(salesR.reduce((a, s) => a + (s.subtotal ?? s.total), 0))} />
          <Row label="মোট ক্রয় (সাবটোটাল)" value={money(purchR.reduce((a, p) => a + (p.subtotal ?? p.total), 0))} />
          <Row label="মোট ছাড় (বিক্রয়ে)" value={"-" + money(totalDiscount)} />
          <Row label="মোট ডেলিভারি চার্জ আদায়" value={"+" + money(totalShipping)} />
          <Row label="মোট খরচ" value={"-" + money(totalExpense)} />
          <Row label="নষ্ট/ক্ষতি (write-off)" value={"-" + money(totalWriteOff)} />
        </div>
        <div className="border-2 p-4" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          <Row label="বর্তমান স্টক মূল্য (বিক্রয় দরে)" value={money(closingStockValue)} />
          <Row label="বর্তমান স্টক মূল্য (ক্রয় দরে)" value={money(closingStockCost)} />
          <Row label="বিক্রয় বাকি" value={money(saleDue)} />
          <Row label="ক্রয় বাকি" value={money(purchDue)} />
        </div>
      </div>
      <div className="border-2 p-4 mb-8" style={{ borderColor: "var(--gold)", background: "var(--paper)" }}>
        <div className="flex items-center justify-between mb-1"><span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 20 }}>Gross Profit</span><span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 20 }}>{money(grossProfit)}</span></div>
        <div className="text-xs mb-3" style={{ color: "var(--ink-faint)" }}>(মোট বিক্রয় − মোট ক্রয়)</div>
        <div className="flex items-center justify-between mb-1"><span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 20, color: netProfit >= 0 ? "var(--green)" : "var(--stamp)" }}>Net Profit</span><span style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 20, color: netProfit >= 0 ? "var(--green)" : "var(--stamp)" }}>{money(netProfit)}</span></div>
        <div className="text-xs" style={{ color: "var(--ink-faint)" }}>(Gross Profit + ডেলিভারি চার্জ − ছাড় − খরচ − নষ্ট/ক্ষতি) — আনুমানিক হিসাব</div>
      </div>

      {writeOffR.length > 0 && (
        <>
          <SectionTitle icon={Ban}>নষ্ট/ক্ষতির হিসাব (Write-offs)</SectionTitle>
          <div className="border-2 mb-8" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
            <div className="hidden md:grid grid-cols-5 px-4 py-2 text-sm font-bold" style={{ borderBottom: "2px solid var(--ink)", color: "var(--ink-faint)" }}>
              <div className="col-span-2">পণ্য</div><div>তারিখ</div><div>কারণ</div><div className="text-right">ক্ষতির মূল্য</div>
            </div>
            {writeOffR.map((w, i) => (
              <div key={w.id} className="grid grid-cols-2 md:grid-cols-5 px-4 py-2.5 gap-1" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
                <div className="col-span-2">{w.productName} {w.batchNo && <span className="text-xs" style={{ color: "var(--ink-faint)" }}>({w.batchNo})</span>} <span className="text-xs" style={{ color: "var(--ink-faint)" }}>— {w.qty} {w.unit}</span></div>
                <div className="text-sm" style={{ color: "var(--ink-faint)" }}>{bnDate(w.date)}</div>
                <div className="text-sm">{w.reason}</div>
                <div className="text-right font-bold" style={{ color: "var(--stamp)" }}>-{money(w.lossValue)}</div>
              </div>
            ))}
            <div className="px-4 py-2.5 text-right font-bold" style={{ borderTop: "2px solid var(--ink)" }}>মোট ক্ষতি: {money(totalWriteOff)}</div>
          </div>
        </>
      )}

      <SectionTitle icon={TrendingUp}>সেরা বিক্রয় ও স্লো-মুভিং</SectionTitle>
      <div className="grid md:grid-cols-2 gap-4 mb-8">
        <div className="border-2 p-4" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}><div className="font-bold mb-2">সেরা বিক্রিত</div>{rankedProducts.slice(0, 5).map((x, i) => <Row key={x.name} label={`${i + 1}. ${x.name}`} value={`${x.qty} ইউনিট`} />)}</div>
        <div className="border-2 p-4" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}><div className="font-bold mb-2">স্লো-মুভিং / বিক্রি হয়নি</div>{slowProducts.slice(0, 5).map((x) => <Row key={x.name} label={x.name} value={`${x.qty} বিক্রি • স্টক ${x.stock ?? "-"}`} />)}</div>
      </div>
      <SectionTitle icon={ShieldAlert}>নিয়ন্ত্রিত ওষুধের রেজিস্টার</SectionTitle>
      <div className="border-2 mb-8" style={{ borderColor: "var(--stamp)", background: "var(--paper)" }}>{controlledSales.length === 0 ? <div className="p-4 text-sm" style={{ color: "var(--ink-faint)" }}>এই সময়ে কোনো নিয়ন্ত্রিত ওষুধ বিক্রি হয়নি।</div> : controlledSales.map((x, i) => <div key={x.id} className="grid md:grid-cols-5 gap-2 px-4 py-2.5 text-sm" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}><span>#{x.invoiceNo}</span><span>{x.controlledRegister.name}</span><span>{x.controlledRegister.address}</span><span>প্রেসক্রিপশন: {x.controlledRegister.prescriptionNo}</span>{x.controlledRegister.imageData && <button className="ledger-btn ledger-btn-sm" onClick={() => setPreviewImage({ src: x.controlledRegister.imageData, title: `প্রেসক্রিপশন — #${x.invoiceNo}` })}>ছবি দেখুন</button>}<span>{bnDateTime(x.createdAt)}</span></div>)}</div>

      <SectionTitle icon={Boxes}>পণ্য অনুযায়ী প্রফিট</SectionTitle>
      <div className="border-2 mb-8" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        <div className="hidden md:grid grid-cols-4 px-4 py-2 text-sm font-bold" style={{ borderBottom: "2px solid var(--ink)", color: "var(--ink-faint)" }}><div>পণ্য</div><div className="text-center">বিক্রি</div><div className="text-right">আয়</div><div className="text-right">আনুমানিক লাভ</div></div>
        {topProducts.length === 0 && <div className="p-4 text-sm" style={{ color: "var(--ink-faint)" }}>এই সময়ে কোনো বিক্রয় নেই।</div>}
        {topProducts.map((p, i) => (
          <div key={p.name} className="grid grid-cols-2 md:grid-cols-4 px-4 py-2.5 items-center gap-1" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
            <span style={{ fontWeight: 600 }}>{p.name}</span><span className="text-center text-sm" style={{ color: "var(--ink-faint)" }}>{p.qty}</span>
            <span className="text-right">{money(p.revenue)}</span><span className="text-right font-bold" style={{ color: p.revenue - p.cost >= 0 ? "var(--green)" : "var(--stamp)" }}>{money(p.revenue - p.cost)}</span>
          </div>
        ))}
      </div>

      <SectionTitle icon={FileBarChart}>ক্রয় ও বিক্রয় তুলনা</SectionTitle>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="border-2 p-4" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          <div className="font-bold mb-2">Purchases</div>
          <Row label="Total Purchase" value={money(totalPurch)} />
          <Row label="Purchase Due" value={money(purchDue)} />
        </div>
        <div className="border-2 p-4" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          <div className="font-bold mb-2">Sales</div>
          <Row label="Total Sale" value={money(totalSales)} />
          <Row label="Sale Due" value={money(saleDue)} />
        </div>
      </div>
      {previewImage && <ImagePreviewModal src={previewImage.src} title={previewImage.title} onClose={() => setPreviewImage(null)} />}
    </div>
  );
}
function Row({ label, value }) {
  return <div className="flex justify-between text-sm py-1" style={{ borderBottom: "1px dotted var(--rule-blue)" }}><span style={{ color: "var(--ink-faint)" }}>{label}</span><span style={{ fontWeight: 700 }}>{value}</span></div>;
}

// ---------- Employees tab ----------
function EmployeesTab({ employees, setEmployees, pushToast, logActivity = () => {} }) {
  const [name, setName] = useState("");
  const [editingPinId, setEditingPinId] = useState(null);
  const [pinValue, setPinValue] = useState("");

  function savePin(id) {
    if (!/^\d{4,6}$/.test(pinValue)) { pushToast("পিন হতে হবে ৪-৬ সংখ্যার", "warn"); return; }
    const emp = employees.find((e) => e.id === id);
    setEmployees(employees.map((e) => (e.id === id ? { ...e, pin: pinValue } : e)));
    setEditingPinId(null); setPinValue("");
    pushToast("পিন বদলানো হয়েছে ✓");
    logActivity("employee_pin_change", `${emp?.name || ""} এর পিন বদলানো হয়েছে`, { refId: id });
  }

  return (
    <div>
      <SectionTitle icon={Users}>কর্মচারী তালিকা</SectionTitle>
      <div className="border-2 max-w-lg" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        {employees.map((e, i) => (
          <div key={e.id} className="flex items-center justify-between px-4 py-3 flex-wrap gap-2" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
            <span style={{ fontWeight: 600 }}>{e.name}</span>
            <div className="flex items-center gap-3">
              <span className="text-xs px-2 py-0.5" style={{ background: e.role === "owner" ? "var(--gold)" : "var(--tab-navy)", color: "#fff" }}>{e.role === "owner" ? "মালিক" : "কর্মচারী"}</span>
              {editingPinId === e.id ? (
                <>
                  <input className="field" style={{ width: 80 }} placeholder="নতুন পিন" value={pinValue} onChange={(ev) => setPinValue(ev.target.value.replace(/\D/g, ""))} />
                  <button className="ledger-btn ledger-btn-sm" onClick={() => savePin(e.id)}>সেভ</button>
                  <button className="ledger-btn ledger-btn-sm" onClick={() => setEditingPinId(null)}>বাতিল</button>
                </>
              ) : (
                <button className="text-xs underline" style={{ color: "var(--ink-faint)" }} onClick={() => { setEditingPinId(e.id); setPinValue(""); }}>পিন বদলান</button>
              )}
              {e.role !== "owner" && <button onClick={() => { setEmployees(employees.filter((x) => x.id !== e.id)); pushToast("কর্মচারী মুছে ফেলা হয়েছে", "warn"); logActivity("employee_delete", `${e.name}`, { refId: e.id }); }}><Trash2 size={16} style={{ color: "var(--stamp)" }} /></button>}
            </div>
          </div>
        ))}
        <div className="flex gap-2 p-4" style={{ borderTop: "2px solid var(--ink)" }}>
          <input className="field" placeholder="নতুন কর্মচারীর নাম" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="ledger-btn ledger-btn-navy" onClick={() => { if (!name.trim()) return; const newId = uid(); setEmployees([...employees, { id: newId, name: name.trim(), role: "staff", pin: "0000" }]); setName(""); pushToast("কর্মচারী যোগ হয়েছে ✓ (ডিফল্ট পিন 0000)"); logActivity("employee_add", `${name.trim()}`, { refId: newId }); }}>যোগ করুন</button>
        </div>
      </div>
    </div>
  );
}

// ---------- অ্যাক্টিভিটি লগ (audit log) ট্যাব ----------
function ActivityLogTab({ logs, employees = [] }) {
  const [q, setQ] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); });
  const [to, setTo] = useState(todayStr());

  const usedActions = Array.from(new Set(logs.map((l) => l.action)));
  const filtered = logs.filter((l) => {
    const logDate = new Date(l.ts).toISOString().slice(0, 10);
    if (logDate < from || logDate > to) return false;
    if (userFilter !== "all" && l.userName !== userFilter) return false;
    if (actionFilter !== "all" && l.action !== actionFilter) return false;
    if (q && !(`${l.userName} ${ACTIVITY_ACTION_LABELS[l.action] || l.action} ${l.details || ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  return (
    <div>
      <SectionTitle icon={History} right={<span className="text-sm" style={{ color: "var(--ink-faint)" }}>মোট এন্ট্রি: {logs.length}</span>}>অ্যাক্টিভিটি লগ (Audit Log)</SectionTitle>

      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>শুরু</label><input type="date" className="field" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="text-xs block" style={{ color: "var(--ink-faint)" }}>শেষ</label><input type="date" className="field" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div>
          <label className="text-xs block" style={{ color: "var(--ink-faint)" }}>ইউজার</label>
          <select className="field" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
            <option value="all">সবাই</option>
            {employees.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs block" style={{ color: "var(--ink-faint)" }}>অ্যাকশন</label>
          <select className="field" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="all">সব ধরনের</option>
            {usedActions.map((a) => <option key={a} value={a}>{ACTIVITY_ACTION_LABELS[a] || a}</option>)}
          </select>
        </div>
        <div className="flex-1 min-w-[180px] flex items-center gap-2 border-2 px-3 py-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          <Search size={16} style={{ color: "var(--ink-faint)" }} /><input className="field" style={{ borderBottom: "none" }} placeholder="খুঁজুন…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {filtered.length === 0 ? <EmptyState text="এই ফিল্টারে কোনো অ্যাক্টিভিটি পাওয়া যায়নি।" /> : (
        <div className="border-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
          <div className="hidden md:grid grid-cols-12 px-4 py-2 text-sm font-bold" style={{ borderBottom: "2px solid var(--ink)", color: "var(--ink-faint)" }}>
            <div className="col-span-2">সময়</div><div className="col-span-2">ইউজার</div><div className="col-span-2">অ্যাকশন</div><div className="col-span-6">বিস্তারিত</div>
          </div>
          {filtered.map((l, i) => (
            <div key={l.id} className="grid grid-cols-1 md:grid-cols-12 px-4 py-2.5 gap-1" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}>
              <div className="col-span-2 text-sm" style={{ color: "var(--ink-faint)" }}>{bnDateTime(l.ts)}</div>
              <div className="col-span-2 font-bold">{l.userName}</div>
              <div className="col-span-2"><span className="text-xs px-2 py-0.5" style={{ background: "var(--tab-navy)", color: "#fff" }}>{ACTIVITY_ACTION_LABELS[l.action] || l.action}</span></div>
              <div className="col-span-6 text-sm">{l.details}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- ক্যাশ রেজিস্টার / শিফট মিলান ----------
function ShiftTab({ shifts, setShifts, currentShiftId, setCurrentShiftId, currentUser, sales, pushToast, logActivity }) {
  const open = shifts.find((x) => x.id === currentShiftId && x.status === "open");
  const [opening, setOpening] = useState(""); const [counted, setCounted] = useState("");
  function start() { if (open || opening === "") return; const x = { id: uid(), status: "open", startedAt: Date.now(), startedBy: currentUser.name, openingCash: Number(opening) || 0 }; setShifts((v) => [x, ...v]); setCurrentShiftId(x.id); setOpening(""); logActivity("shift_start", `ওপেনিং ক্যাশ ${money(x.openingCash)}`); pushToast("শিফট শুরু হয়েছে ✓"); }
  function end() { if (!open || counted === "") return; const shiftSales = sales.filter((x) => x.shiftId === open.id); const expected = open.openingCash + shiftSales.filter((x) => x.payMethod === "ক্যাশ").reduce((a, x) => a + (x.paid || 0), 0); const x = { ...open, status: "closed", endedAt: Date.now(), countedCash: Number(counted) || 0, expectedCash: expected, difference: (Number(counted) || 0) - expected }; setShifts((v) => v.map((y) => y.id === open.id ? x : y)); setCurrentShiftId(null); setCounted(""); logActivity("shift_end", `কাউন্টেড ${money(x.countedCash)} / সিস্টেম ${money(expected)} / পার্থক্য ${money(x.difference)}`); pushToast("শিফট শেষ ও ক্যাশ মিলানো হয়েছে ✓"); }
  return <div><SectionTitle icon={Wallet}>ক্যাশ রেজিস্টার / শিফট মিলান</SectionTitle><div className="border-2 p-4 max-w-xl mb-6" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>{open ? <><div className="font-bold mb-2">চলমান শিফট • শুরু করেছেন {open.startedBy}</div><div className="text-sm mb-3">ওপেনিং ক্যাশ: {money(open.openingCash)}</div><div className="flex gap-2"><input type="number" className="field" placeholder="কাউন্টেড ক্যাশ" value={counted} onChange={(e) => setCounted(e.target.value)} /><button className="ledger-btn ledger-btn-solid" onClick={end}>শিফট শেষ করুন</button></div></> : <div className="flex gap-2"><input type="number" className="field" placeholder="ওপেনিং ক্যাশ" value={opening} onChange={(e) => setOpening(e.target.value)} /><button className="ledger-btn ledger-btn-solid" onClick={start}>শিফট শুরু করুন</button></div>}</div><div className="border-2" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>{shifts.map((x, i) => <div key={x.id} className="flex justify-between px-4 py-2.5 text-sm" style={{ borderTop: i ? "1px solid var(--rule-blue)" : "none" }}><span>{bnDateTime(x.startedAt)} • {x.startedBy}</span><span>{x.status === "open" ? "চলমান" : `পার্থক্য ${money(x.difference)}`}</span></div>)}</div></div>;
}

function AdvancedPharmacyTab({ records, setRecords, products, setProducts, setSales = () => {}, purchases, sales, customers, employees, currentUser, pushToast, logActivity }) {
  const [section, setSection] = useState("returns"); const [selected, setSelected] = useState(""); const [qty, setQty] = useState("1"); const [note, setNote] = useState("");
  const [branch, setBranch] = useState(""); const [warehouse, setWarehouse] = useState(""); const [transferQty, setTransferQty] = useState("1"); const [vat, setVat] = useState(String(records.taxConfig?.vatRate || 0));
  const save = (key, item) => setRecords((r) => ({ ...r, [key]: [item, ...(r[key] || [])] }));
  function purchaseReturn() { const p = purchases.find((x) => x.id === selected); if (!p) return; const item = { id: uid(), purchaseId: p.id, refNo: p.refNo || "", qty: Number(qty) || 1, reason: note || "সাপ্লায়ার রিটার্ন", date: todayStr(), by: currentUser.name, type: "purchase_return" }; save("purchaseReturns", item); logActivity("purchase_return", `${p.refNo || p.id} — ${item.qty} — ${item.reason}`); pushToast("Purchase return রেকর্ড হয়েছে ✓"); }
  function refundRequest() { const sale = sales.find((x) => x.id === selected); if (!sale) return; const item = { id: uid(), saleId: sale.id, invoiceNo: sale.invoiceNo, amount: Number(qty) || sale.total, reason: note || "কাস্টমার refund", status: "pending", date: todayStr(), requestedBy: currentUser.name }; save("refundRequests", item); logActivity("refund_request", `ইনভয়েস #${sale.invoiceNo} — ${money(item.amount)}`); pushToast("Refund approval request তৈরি হয়েছে ✓"); }
  function approveRefund(x) { setRecords((r) => ({ ...r, refundRequests: r.refundRequests.map((z) => z.id === x.id ? { ...z, status: "approved", approvedBy: currentUser.name, approvedAt: Date.now(), accountingPosted: true } : z) })); setSales((ss) => ss.map((sale) => sale.id === x.saleId ? { ...sale, refundApprovedAmount: (sale.refundApprovedAmount || 0) + Number(x.amount || 0), lastRefundAt: Date.now() } : sale)); logActivity("refund_approve", `ইনভয়েস #${x.invoiceNo} — ${money(x.amount)} — হিসাব পোস্ট হয়েছে`); pushToast("Refund approved ও sales হিসাব update হয়েছে ✓"); }
  function transfer() { if (!selected || !branch || !warehouse) return; const item = { id: uid(), productId: selected, productName: products.find((p) => p.id === selected)?.name, qty: Number(transferQty) || 1, from: "মূল গুদাম", to: `${branch} / ${warehouse}`, date: todayStr(), by: currentUser.name }; save("transfers", item); setProducts((ps) => ps.map((p) => p.id === selected ? { ...p, stock: Math.max(0, p.stock - item.qty) } : p)); logActivity("warehouse_transfer", `${item.productName} — ${item.qty} — ${item.to}`); pushToast("Warehouse transfer রেকর্ড হয়েছে ✓"); }
  const setPerm = (emp, role, checked) => setRecords((r) => ({ ...r, permissions: { ...r.permissions, [emp]: { ...(r.permissions[emp] || {}), [role]: checked } } }));
  const expired = products.filter((p) => p.expiry && daysBetween(p.expiry) <= 30);
  return <div><SectionTitle icon={ClipboardList}>ফার্মেসি অপারেশন কন্ট্রোল</SectionTitle>
    <div className="flex flex-wrap gap-2 mb-5">{[["returns","Return"],["refund","Refund approval"],["permissions","Role permissions"],["security","Security"],["transfer","Warehouse/branch"],["reconcile","Mobile reconciliation"],["prescription","Prescription history"],["expiry","Expiry notification"],["tax","Tax/VAT"],["pricing","Pricing/loyalty"],["margins","Profit margin"],["performance","Staff performance"],["supplierCompare","Supplier compare"],["warnings","Drug warnings"],["autoPO","Auto purchase order"],["audit","Bulk stock audit"],["auditApprove","Audit approval"],["expiryAction","Expiry actions"],["theme","Dark mode / shortcuts"],["cloud","Cloud migration"]].map(([id,label]) => <button key={id} className={`subnav-btn ${section===id?"active":""}`} onClick={() => setSection(id)}>{label}</button>)}</div>
    {section === "returns" && <div className="grid md:grid-cols-2 gap-4"><div className="border-2 p-4" style={{ borderColor:"var(--ink)", background:"var(--paper)" }}><div className="font-bold mb-2">Purchase / Supplier return</div><select className="field mb-2" value={selected} onChange={(e)=>setSelected(e.target.value)}><option value="">Purchase বাছাই করুন</option>{purchases.map((x)=><option key={x.id} value={x.id}>{x.refNo || x.id} — {x.supplierName}</option>)}</select><input type="number" className="field mb-2" value={qty} onChange={(e)=>setQty(e.target.value)} placeholder="Quantity"/><input className="field mb-2" value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Return reason"/><button className="ledger-btn ledger-btn-solid" onClick={purchaseReturn}>Supplier return save</button></div><div className="border-2 p-4" style={{ borderColor:"var(--ink)", background:"var(--paper)" }}><div className="font-bold mb-2">Return history</div>{records.purchaseReturns.map((x)=><div key={x.id} className="text-sm py-1 border-t">{x.refNo} • {x.qty} • {x.reason}</div>)}</div></div>}
    {section === "refund" && <div className="border-2 p-4 max-w-2xl" style={{ borderColor:"var(--ink)", background:"var(--paper)" }}><select className="field mb-2" value={selected} onChange={(e)=>setSelected(e.target.value)}><option value="">Sale বাছাই করুন</option>{sales.map((x)=><option key={x.id} value={x.id}>#{x.invoiceNo} — {x.customerName} — {money(x.total)}</option>)}</select><input type="number" className="field mb-2" value={qty} onChange={(e)=>setQty(e.target.value)} placeholder="Refund amount"/><input className="field mb-2" value={note} onChange={(e)=>setNote(e.target.value)} placeholder="Reason"/><button className="ledger-btn ledger-btn-solid" onClick={refundRequest}>Approval request</button><div className="mt-4">{records.refundRequests.map((x)=><div key={x.id} className="flex justify-between border-t py-2 text-sm"><span>#{x.invoiceNo} • {money(x.amount)} • {x.status}</span>{x.status === "pending" && <button className="ledger-btn ledger-btn-sm" onClick={()=>approveRefund(x)}>Approve</button>}</div>)}</div></div>}
    {section === "permissions" && <div className="border-2" style={{ borderColor:"var(--ink)", background:"var(--paper)" }}>{employees.map((e)=><div key={e.id} className="p-3 border-t"><b>{e.name}</b><div className="flex flex-wrap gap-3 text-sm">{["sales","purchase","discount","refund","reports","backup","delete"].map((role)=><label key={role}><input type="checkbox" checked={!!records.permissions?.[e.id]?.[role]} onChange={(ev)=>setPerm(e.id,role,ev.target.checked)}/> {role}</label>)}</div></div>)}</div>}
    {section === "security" && <div className="border-2 p-4 max-w-xl" style={{ borderColor:"var(--ink)", background:"var(--paper)" }}><label className="block text-sm mb-2">Session timeout (minutes)<input type="number" className="field" value={records.securityConfig?.sessionMinutes || 30} onChange={(e)=>setRecords((r)=>({...r,securityConfig:{...r.securityConfig,sessionMinutes:Number(e.target.value)||30}}))}/></label><label className="block text-sm">Failed PIN attempts limit<input type="number" className="field" value={records.securityConfig?.maxPinAttempts || 5} onChange={(e)=>setRecords((r)=>({...r,securityConfig:{...r.securityConfig,maxPinAttempts:Number(e.target.value)||5}}))}/></label><div className="text-xs mt-2" style={{color:"var(--ink-faint)"}}>এই settings local workflow-এর জন্য সংরক্ষিত; live authentication-এ server-side enforcement করতে হবে।</div></div>}
    {section === "transfer" && <div className="border-2 p-4 max-w-xl" style={{ borderColor:"var(--ink)", background:"var(--paper)" }}><select className="field mb-2" value={selected} onChange={(e)=>setSelected(e.target.value)}><option value="">Product</option>{products.map((p)=><option key={p.id} value={p.id}>{p.name} — {p.stock} {p.unit}</option>)}</select><input className="field mb-2" placeholder="Branch" value={branch} onChange={(e)=>setBranch(e.target.value)}/><input className="field mb-2" placeholder="Warehouse" value={warehouse} onChange={(e)=>setWarehouse(e.target.value)}/><input type="number" className="field mb-2" value={transferQty} onChange={(e)=>setTransferQty(e.target.value)}/><button className="ledger-btn ledger-btn-solid" onClick={transfer}>Transfer save</button></div>}
    {section === "reconcile" && <div className="border-2 p-4 max-w-xl" style={{borderColor:"var(--ink)",background:"var(--paper)"}}><input className="field mb-2" placeholder="Payment method (bKash/Nagad/card)" value={note} onChange={(e)=>setNote(e.target.value)}/><input type="number" className="field mb-2" placeholder="System amount" value={qty} onChange={(e)=>setQty(e.target.value)}/><button className="ledger-btn ledger-btn-solid" onClick={()=>{save("reconciliations",{id:uid(),method:note,systemAmount:Number(qty),date:todayStr(),by:currentUser.name});pushToast("Reconciliation saved ✓")}}>Save reconciliation</button>{records.reconciliations.map((x)=><div className="text-sm border-t py-1" key={x.id}>{x.method} • {money(x.systemAmount)} • {x.date}</div>)}</div>}
    {section === "prescription" && <div className="border-2" style={{borderColor:"var(--ink)",background:"var(--paper)"}}>{sales.filter((x)=>x.controlledRegister).map((x)=><div key={x.id} className="p-3 border-t text-sm">#{x.invoiceNo} • {x.controlledRegister.name} • {x.controlledRegister.doctorName || "ডাক্তার নেই"} • {x.controlledRegister.prescriptionNo}</div>)}</div>}
    {section === "expiry" && <div className="border-2" style={{borderColor:"var(--stamp)",background:"var(--paper)"}}>{expired.map((p)=><div key={p.id} className="p-3 border-t text-sm">{p.name} • {p.expiry} • {daysBetween(p.expiry) < 0 ? "মেয়াদ শেষ" : `${daysBetween(p.expiry)} দিন বাকি`}</div>)}</div>}
    {section === "tax" && <div className="border-2 p-4 max-w-xl" style={{borderColor:"var(--ink)",background:"var(--paper)"}}><label className="text-sm">VAT/Tax rate (%)<input type="number" className="field" value={vat} onChange={(e)=>setVat(e.target.value)}/></label><button className="ledger-btn ledger-btn-solid mt-3" onClick={()=>{setRecords((r)=>({...r,taxConfig:{...r.taxConfig,vatRate:Number(vat)||0}}));pushToast("Tax/VAT config saved ✓")}}>Save tax settings</button></div>}
    {section === "pricing" && <div className="border-2 p-4 max-w-2xl" style={{borderColor:"var(--ink)",background:"var(--paper)"}}><div className="font-bold mb-2">Customer group / wholesale-retail / loyalty</div><p className="text-sm">Customer group ও loyalty points data model প্রস্তুত রাখুন। Point rule: প্রতি ১০০ টাকায় ১ point; customer purchase total থেকে points গণনা করা যাবে। Wholesale/retail price field product pricing-এর সঙ্গে যুক্ত করার জন্য প্রস্তুত।</p><div className="grid md:grid-cols-3 gap-2 mt-3">{customers.slice(0,12).map((c)=><div key={c.id} className="border p-2 text-sm"><b>{c.name}</b><div>Loyalty: {Math.floor((sales.filter((x)=>x.customerId===c.id).reduce((a,x)=>a+x.total,0))/100)} points</div><div>Group: {c.group || "Retail"}</div></div>)}</div></div>}
    {section === "margins" && <div className="border-2 p-4" style={{borderColor:"var(--ink)",background:"var(--paper)"}}><div className="font-bold mb-2">Product/category profit margin</div>{products.map((p)=><div key={p.id} className="flex justify-between border-t py-2 text-sm"><span>{p.name} • {p.category}</span><span>{p.sellPrice ? `${(((p.sellPrice-p.purchasePrice)/p.sellPrice)*100).toFixed(1)}% margin` : "-"}</span></div>)}</div>}
    {section === "performance" && <div className="border-2 p-4" style={{borderColor:"var(--ink)",background:"var(--paper)"}}><div className="font-bold mb-2">Employee performance</div>{employees.map((e)=><div key={e.id} className="flex justify-between border-t py-2 text-sm"><span>{e.name}</span><span>{sales.filter((x)=>x.soldBy===e.name).length} sales • {money(sales.filter((x)=>x.soldBy===e.name).reduce((a,x)=>a+x.total,0))}</span></div>)}</div>}
    {section === "supplierCompare" && <div className="border-2 p-4" style={{borderColor:"var(--ink)",background:"var(--paper)"}}><div className="font-bold mb-2">Supplier price comparison</div>{products.map((p)=><div key={p.id} className="flex justify-between border-t py-2 text-sm"><span>{p.name}</span><span>{money(p.purchasePrice)} current cost</span></div>)}</div>}
    {section === "warnings" && <div className="border-2 p-4 max-w-2xl" style={{borderColor:"var(--stamp)",background:"var(--paper)"}}><div className="font-bold mb-2">Drug interaction / allergy warning</div><p className="text-sm">Product-এর detail, generic name, high-alert ও antibiotic flag checkout-এর আগে review করার জন্য দেখানো হচ্ছে। Staff-কে allergy ও interaction যাচাই করে sale confirm করতে হবে।</p>{products.filter((p)=>p.isHighAlert||p.isAntibiotic||p.requiresRx).map((p)=><div key={p.id} className="border-t py-2 text-sm">⚠ {p.name} — {p.isAntibiotic?"অ্যান্টিবায়োটিক ":""}{p.isHighAlert?"High-alert ":""}{p.requiresRx?"Rx আবশ্যক":""}</div>)}</div>}
    {section === "autoPO" && <div className="border-2 p-4 max-w-2xl" style={{borderColor:"var(--ink)",background:"var(--paper)"}}><div className="font-bold mb-2">Automatic low-stock purchase order</div><p className="text-sm mb-3">নিচের সব low-stock product-এর জন্য একসাথে draft PO তৈরি হবে।</p><button className="ledger-btn ledger-btn-solid" onClick={()=>{const low=products.filter((p)=>p.stock <= (p.reorderLevel ?? p.lowStockAt ?? 5)); setRecords((r)=>({...r,autoPOs:[{id:uid(),date:todayStr(),status:"draft",items:low.map((p)=>({productId:p.id,name:p.name,qty:Math.max((p.maxStock||((p.reorderLevel||5)*2))-p.stock,1)}))},...(r.autoPOs||[])]}));pushToast(`${low.length}টি পণ্যের draft PO তৈরি হয়েছে ✓`)}}>সব low-stock-এর PO তৈরি করুন</button></div>}
    {section === "audit" && <div className="border-2 p-4 max-w-2xl" style={{borderColor:"var(--ink)",background:"var(--paper)"}}><div className="font-bold mb-2">Bulk physical stock audit</div><p className="text-sm">Physical count লিখে একসাথে stock audit record তৈরি করুন।</p>{products.slice(0,20).map((p)=><div key={p.id} className="grid grid-cols-3 gap-2 border-t py-2 text-sm"><span>{p.name}</span><span>System: {p.stock}</span><input type="number" className="field" placeholder="Physical count" onChange={(e)=>{p._physical=e.target.value}} /></div>)}<button className="ledger-btn ledger-btn-solid mt-3" onClick={()=>{const items=products.filter((p)=>p._physical!==undefined).map((p)=>({productId:p.id,system:p.stock,physical:Number(p._physical),difference:Number(p._physical)-p.stock})); setRecords((r)=>({...r,stockAudits:[{id:uid(),date:todayStr(),by:currentUser.name,items},...(r.stockAudits||[])]})); pushToast("Bulk stock audit saved ✓")}}>Audit save</button></div>}
    {section === "auditApprove" && <div className="border-2 p-4 max-w-2xl" style={{borderColor:"var(--ink)",background:"var(--paper)"}}><div className="font-bold mb-2">Stock audit approval</div>{(records.stockAudits||[]).map((a)=><div key={a.id} className="border-t py-2 text-sm flex justify-between"><span>{a.date} • {a.items.length} products • {a.by}</span>{!a.approved ? <button className="ledger-btn ledger-btn-sm" onClick={()=>{const ids=new Map(a.items.map((x)=>[x.productId,x.physical])); setProducts((ps)=>ps.map((p)=>ids.has(p.id)?{...p,stock:Math.max(0,ids.get(p.id))}:p)); setRecords((r)=>({...r,stockAudits:(r.stockAudits||[]).map((x)=>x.id===a.id?{...x,approved:true,approvedBy:currentUser.name,approvedAt:Date.now()}:x)})); logActivity("stock_audit_approve",`${a.items.length} products`);pushToast("Audit approved ও stock update হয়েছে ✓")}}>Approve & update stock</button>:<span style={{color:"var(--green)"}}>Approved</span>}</div>)}</div>}
    {section === "expiryAction" && <div className="border-2 p-4 max-w-2xl" style={{borderColor:"var(--gold)",background:"var(--paper)"}}><div className="font-bold mb-2">Expiry action center</div>{products.filter((p)=>p.expiry && daysBetween(p.expiry)<=90).map((p)=><div key={p.id} className="border-t py-2 text-sm flex justify-between"><span>{p.name} • {p.expiry} • {daysBetween(p.expiry)<0?"Expired":`${daysBetween(p.expiry)} days left`}</span><button className="ledger-btn ledger-btn-sm" onClick={()=>{setProducts((ps)=>ps.map((x)=>x.id===p.id?{...x,expiryAction:"quarantine"}:x));logActivity("expiry_quarantine",p.name);pushToast("Product quarantine mark করা হয়েছে")}}>Quarantine</button></div>)}</div>}
    {section === "theme" && <div className="border-2 p-4 max-w-xl" style={{borderColor:"var(--ink)",background:"var(--paper)"}}><div className="font-bold mb-2">Dark mode & keyboard shortcuts</div><button className="ledger-btn ledger-btn-solid mr-2" onClick={()=>{document.documentElement.classList.toggle("dark"); document.body.style.background = document.documentElement.classList.contains("dark") ? "#111827" : ""; pushToast("Theme changed")}}>Dark mode toggle</button><div className="text-sm mt-3">Shortcuts: <b>Ctrl/Cmd + S</b> save/confirm, <b>Esc</b> close modal, <b>F2</b> focus POS search.</div></div>}
    {section === "cloud" && <div className="border-2 p-4 max-w-2xl" style={{borderColor:"var(--ink)",background:"var(--paper)"}}><div className="font-bold mb-2">Live migration readiness</div><p className="text-sm">Local records are grouped for Firebase migration: returns, refundRequests, permissions, transfers, reconciliations, prescriptions, branches, warehouses and taxConfig.</p><div className="text-sm mt-2" style={{color:"var(--ink-faint)"}}>Firebase Authentication, Firestore, Storage, multi-device sync, cloud backup and automatic WhatsApp sending require live service credentials/backend.</div></div>}
  </div>;
}

// ---------- Settings ও Backup ট্যাব ----------
function downloadTextFile(filename, content, mime = "application/json") {
  const blob = new Blob([content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function toCSV(rows, headers) {
  const esc = (v) => { const s = String(v ?? ""); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [headers.map((h) => esc(h.label)).join(",")];
  rows.forEach((r) => lines.push(headers.map((h) => esc(typeof h.value === "function" ? h.value(r) : r[h.value])).join(",")));
  return "\uFEFF" + lines.join("\n"); // BOM যোগ করা হয়েছে যাতে Excel-এ বাংলা ঠিকমতো দেখায়
}
// সাধারণ CSV পার্সার (quoted field, কমা-সহ ভ্যালু, একাধিক লাইনের কোয়োটেড টেক্সট — সবই হ্যান্ডেল করে)
function parseCSV(text) {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows = []; let row = []; let field = ""; let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"') { if (clean[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).filter((r) => r.some((c) => c.trim() !== "")).map((r) => {
    const obj = {}; headers.forEach((h, i) => { obj[h] = (r[i] ?? "").trim(); }); return obj;
  });
}
// CSV হেডারে বাংলা/ইংরেজি — দুই ভাষার নামই মেলানো হয় (ছোট-বড় হাতের অক্ষর, স্পেস উপেক্ষা করে)
const PRODUCT_CSV_ALIASES = {
  name: ["নাম", "পণ্যের নাম", "name", "product", "productname"],
  sku: ["sku"],
  barcode: ["বারকোড", "barcode"],
  category: ["ক্যাটাগরি", "category"],
  unit: ["একক", "unit"],
  stock: ["স্টক", "stock", "qty", "quantity"],
  purchasePrice: ["ক্রয় মূল্য", "purchaseprice", "cost", "costprice"],
  sellPrice: ["বিক্রয় মূল্য", "sellprice", "price", "sellingprice"],
  lowStockAt: ["সতর্কতা পরিমাণ", "lowstockat", "lowstock"],
  expiry: ["মেয়াদ", "মেয়াদ (নিকটতম)", "expiry", "expirydate"],
  genericName: ["জেনেরিক নাম", "genericname", "generic"],
  dose: ["ডোজ", "dose"],
  detail: ["মডেল নং", "মডেল", "detail", "model"],
};
function normalizeHeader(h) { return h.toLowerCase().replace(/\s+/g, "").replace(/[()]/g, ""); }
function mapCsvRowToProduct(row) {
  const normalized = {}; Object.keys(row).forEach((h) => { normalized[normalizeHeader(h)] = row[h]; });
  const out = {};
  Object.entries(PRODUCT_CSV_ALIASES).forEach(([field, aliases]) => {
    for (const alias of aliases) { const key = normalizeHeader(alias); if (normalized[key] !== undefined && normalized[key] !== "") { out[field] = normalized[key]; break; } }
  });
  return out;
}

function SettingsBackupTab({ shopCode, shopName, setShopName, shopPhone, setShopPhone, shopTaxRate, setShopTaxRate, shopMfsNumber, setShopMfsNumber, shopBin, setShopBin, invoiceFormat, setInvoiceFormat, discountPinLimit, setDiscountPinLimit, allData, restoreData, pushToast }) {
  const [nameInput, setNameInput] = useState(shopName);
  const [phoneInput, setPhoneInput] = useState(shopPhone);
  const [taxInput, setTaxInput] = useState(String(shopTaxRate ?? 0));
  const [mfsInput, setMfsInput] = useState(shopMfsNumber || "");
  const [binInput, setBinInput] = useState(shopBin || "");
  const [dpLimitInput, setDpLimitInput] = useState(String(discountPinLimit ?? 15));
  const [confirmRestore, setConfirmRestore] = useState(null); // parsed data waiting for confirmation

  function saveShopInfo() {
    setShopName(nameInput.trim() || shopName);
    setShopPhone(phoneInput.trim());
    const rate = Math.max(0, Math.min(100, Number(taxInput) || 0));
    setShopTaxRate(rate);
    setShopMfsNumber(mfsInput.trim());
    setShopBin(binInput.trim());
    setDiscountPinLimit(Math.max(0, Math.min(100, Number(dpLimitInput) || 0)));
    pushToast("দোকানের তথ্য সেভ হয়েছে ✓");
  }
  function exportJSON() {
    const payload = { exportedAt: new Date().toISOString(), shopCode, ...allData };
    downloadTextFile(`dokan-backup-${shopCode}-${todayStr()}.json`, JSON.stringify(payload, null, 2));
    pushToast("সম্পূর্ণ ব্যাকআপ ডাউনলোড হয়েছে ✓");
  }
  function exportSalesCSV() {
    const csv = toCSV(allData.sales, [
      { label: "ইনভয়েস", value: "invoiceNo" }, { label: "তারিখ", value: "date" },
      { label: "কাস্টমার", value: "customerName" }, { label: "সাবটোটাল", value: "subtotal" },
      { label: "ছাড়", value: "discount" }, { label: "মোট", value: "total" },
      { label: "পরিশোধ", value: "paid" }, { label: "বাকি", value: "due" },
      { label: "পেমেন্ট মাধ্যম", value: "payMethod" }, { label: "প্রেরকের নম্বর", value: "senderNumber" }, { label: "বিক্রেতা", value: "soldBy" },
    ]);
    downloadTextFile(`sales-${todayStr()}.csv`, csv, "text/csv");
    pushToast("বিক্রয়ের CSV ডাউনলোড হয়েছে ✓");
  }
  function exportProductsCSV() {
    const csv = toCSV(allData.products.map((p) => ({ ...p, batchCount: (p.batches || []).length })), [
      { label: "নাম", value: "name" }, { label: "SKU", value: "sku" }, { label: "বারকোড", value: "barcode" },
      { label: "ক্যাটাগরি", value: "category" }, { label: "একক", value: "unit" }, { label: "স্টক", value: "stock" },
      { label: "ক্রয় মূল্য", value: "purchasePrice" }, { label: "বিক্রয় মূল্য", value: "sellPrice" },
      { label: "মেয়াদ (নিকটতম)", value: "expiry" }, { label: "ব্যাচ সংখ্যা", value: "batchCount" },
    ]);
    downloadTextFile(`products-${todayStr()}.csv`, csv, "text/csv");
    pushToast("পণ্যের CSV ডাউনলোড হয়েছে ✓");
  }
  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        setConfirmRestore(data);
      } catch (err) {
        pushToast("ফাইলটা পড়া যায়নি — এটা কি সঠিক ব্যাকআপ ফাইল?", "warn");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div>
      <SectionTitle icon={Settings}>সেটিংস ও ব্যাকআপ</SectionTitle>

      <div className="border-2 max-w-lg p-4 mb-8" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        <div className="font-bold mb-3">দোকানের তথ্য</div>
        <div className="flex flex-col gap-3">
          <div><label className="text-xs block mb-1" style={{ color: "var(--ink-faint)" }}>দোকানের নাম</label><input className="field" value={nameInput} onChange={(e) => setNameInput(e.target.value)} /></div>
          <div><label className="text-xs block mb-1" style={{ color: "var(--ink-faint)" }}>দোকানের ফোন নম্বর (ইনভয়েসে দেখাবে)</label><input className="field" value={phoneInput} onChange={(e) => setPhoneInput(e.target.value)} placeholder="যেমন: 01XXXXXXXXX" /></div>
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--ink-faint)" }}>ডিফল্ট ভ্যাট/ট্যাক্স হার (%)</label>
            <input type="number" min="0" max="100" step="0.01" className="field" value={taxInput} onChange={(e) => setTaxInput(e.target.value)} placeholder="যেমন: 15" />
            <div className="text-xs mt-1" style={{ color: "var(--ink-faint)" }}>প্রতিটা নতুন বিক্রয়ে এই হারটা অটো বসবে — বিক্রির সময় চাইলে বদলে দেওয়া যাবে। ট্যাক্স না লাগলে ০ রাখুন।</div>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--ink-faint)" }}>দোকানের বিকাশ/নগদ/রকেট নম্বর (ঐচ্ছিক)</label>
            <input className="field" value={mfsInput} onChange={(e) => setMfsInput(e.target.value)} placeholder="যেমন: 017XXXXXXXX" />
            <div className="text-xs mt-1" style={{ color: "var(--ink-faint)" }}>বিক্রির সময় মোবাইল ব্যাংকিং বেছে নিলে এই নম্বরটা কাউন্টারে দেখানো হবে, যাতে গ্রাহককে সঠিক নম্বর বলা যায়।</div>
          </div>
          <div>
            <label className="text-xs block mb-1 flex items-center gap-1" style={{ color: "var(--ink-faint)" }}><KeyRound size={12} /> বড় ছাড়ে মালিকের PIN লাগবে (% এর বেশি হলে)</label>
            <input type="number" min="0" max="100" className="field" style={{ maxWidth: 120 }} value={dpLimitInput} onChange={(e) => setDpLimitInput(e.target.value)} placeholder="যেমন: 15" />
            <div className="text-xs mt-1" style={{ color: "var(--ink-faint)" }}>কর্মচারী বিক্রি করার সময় এর চেয়ে বেশি % ছাড় দিতে চাইলে মালিকের PIN চাওয়া হবে। মালিক নিজে লগইন থাকলে PIN লাগবে না।</div>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--ink-faint)" }}>BIN নম্বর (ভ্যাট রেজিস্ট্রেশন থাকলে, ঐচ্ছিক)</label>
            <input className="field" value={binInput} onChange={(e) => setBinInput(e.target.value)} placeholder="যেমন: 000000000-0000" />
            <div className="text-xs mt-1" style={{ color: "var(--ink-faint)" }}>দেওয়া থাকলে প্রতিটা ইনভয়েসে দোকানের নামের নিচে প্রিন্ট হবে। মুসক ৬.৩-এর সঠিক ফরম্যাট NBR-নির্ধারিত — জমা দেওয়ার আগে একজন অ্যাকাউন্ট্যান্ট/ভ্যাট কনসালট্যান্ট দিয়ে যাচাই করিয়ে নিন।</div>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: "var(--ink-faint)" }}>ইনভয়েস প্রিন্ট ফরম্যাট</label>
            <select className="field" value={invoiceFormat} onChange={(e) => setInvoiceFormat(e.target.value)}>
              <option value="a4">সাধারণ প্রিন্টার (A4/লেটার)</option>
              <option value="thermal58">থার্মাল রিসিট প্রিন্টার — ৫৮মিমি</option>
              <option value="thermal80">থার্মাল রিসিট প্রিন্টার — ৮০মিমি</option>
            </select>
            <div className="text-xs mt-1" style={{ color: "var(--ink-faint)" }}>দোকানের কাউন্টারে যে প্রিন্টার আছে সেটা বেছে নিন — থার্মাল বেছে নিলে ইনভয়েস সরু রিসিট-আকারে ছাপা হবে।</div>
          </div>
          <button className="ledger-btn ledger-btn-navy self-start" onClick={saveShopInfo}>সেভ করুন</button>
        </div>
      </div>

      <div className="border-2 max-w-lg p-4 mb-8" style={{ borderColor: "var(--ink)", background: "var(--paper)" }}>
        <div className="font-bold mb-2">ব্যাকআপ ডাউনলোড করুন</div>
        <p className="text-sm mb-3" style={{ color: "var(--ink-faint)" }}>এখনকার ডেটা-স্টোরেজ অস্থায়ী (প্রিভিউ ভার্সন) — তাই নিয়মিত ব্যাকআপ ডাউনলোড করে রাখা জরুরি। সপ্তাহে অন্তত একবার নিন।</p>
        <div className="flex flex-wrap gap-2">
          <button className="ledger-btn ledger-btn-solid flex items-center gap-2" onClick={exportJSON}><Download size={16} /> সম্পূর্ণ ব্যাকআপ (JSON)</button>
          <button className="ledger-btn flex items-center gap-2" onClick={exportSalesCSV}><Download size={16} /> বিক্রয় CSV</button>
          <button className="ledger-btn flex items-center gap-2" onClick={exportProductsCSV}><Download size={16} /> পণ্য CSV</button>
        </div>
      </div>

      <div className="border-2 max-w-lg p-4" style={{ borderColor: "var(--stamp)", background: "var(--paper)" }}>
        <div className="font-bold mb-2 flex items-center gap-2"><ShieldAlert size={16} style={{ color: "var(--stamp)" }} /> ব্যাকআপ থেকে পুনরুদ্ধার করুন</div>
        <p className="text-sm mb-3" style={{ color: "var(--ink-faint)" }}>সতর্কতা: এটি বর্তমান সব ডেটা (বিক্রয়, ক্রয়, স্টক, কাস্টমার ইত্যাদি) প্রতিস্থাপন করবে। শুধু আগের ডাউনলোড করা JSON ব্যাকআপ ফাইল ব্যবহার করুন।</p>
        <label className="ledger-btn flex items-center gap-2 w-fit cursor-pointer">
          <UploadCloud size={16} /> ব্যাকআপ ফাইল বেছে নিন
          <input type="file" accept="application/json" className="hidden" onChange={handleFile} />
        </label>
      </div>

      {confirmRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(33,38,31,0.55)" }}>
          <div className="w-full max-w-sm border-2 p-6" style={{ borderColor: "var(--stamp)", background: "var(--paper)" }}>
            <div className="flex items-center gap-2 mb-3"><ShieldAlert size={22} style={{ color: "var(--stamp)" }} /><div style={{ fontWeight: 900, fontSize: 18 }}>নিশ্চিত করুন</div></div>
            <p className="text-sm mb-4" style={{ color: "var(--ink-faint)" }}>এই ব্যাকআপ ফাইলটা বসালে বর্তমান সব ডেটা মুছে গিয়ে ফাইলের ডেটা বসে যাবে। এটা ফেরানো যাবে না। আপনি কি নিশ্চিত?</p>
            <div className="flex gap-2">
              <button className="ledger-btn flex-1" onClick={() => setConfirmRestore(null)}>বাতিল</button>
              <button className="ledger-btn flex-1 justify-center" style={{ background: "var(--stamp)", color: "#fff", borderColor: "var(--stamp)" }} onClick={() => { restoreData(confirmRestore); setConfirmRestore(null); pushToast("ব্যাকআপ থেকে পুনরুদ্ধার সম্পন্ন হয়েছে ✓"); }}>হ্যাঁ, প্রতিস্থাপন করুন</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Shop-level login (Firebase Auth দিয়ে, পুরো দোকানের একটাই অ্যাকাউন্ট) ----------
function ShopLogin({ onSuccess }) {
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr(""); setBusy(true);
    try {
      if (mode === "login") {
        await shopSignIn(email.trim(), password);
      } else {
        await shopSignUp(email.trim(), password);
      }
      onSuccess && onSuccess();
    } catch (e2) {
      const map = {
        "auth/invalid-email": "ইমেইলটা সঠিক না",
        "auth/user-not-found": "এই ইমেইলে কোনো অ্যাকাউন্ট নেই — নিচে 'নতুন অ্যাকাউন্ট' চাপুন",
        "auth/wrong-password": "পাসওয়ার্ড ভুল হয়েছে",
        "auth/invalid-credential": "ইমেইল বা পাসওয়ার্ড ভুল",
        "auth/email-already-in-use": "এই ইমেইলে আগে থেকেই অ্যাকাউন্ট আছে — 'লগইন' করুন",
        "auth/weak-password": "পাসওয়ার্ড কমপক্ষে ৬ ঘর হতে হবে",
      };
      setErr(map[e2.code] || "কিছু একটা সমস্যা হয়েছে, আবার চেষ্টা করুন");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-6" style={{ background: "var(--paper)" }}>
      <form onSubmit={submit} className="w-full max-w-sm border-2 p-6" style={{ borderColor: "var(--ink)", background: "#fff" }}>
        <div className="text-center mb-5">
          <div style={{ fontFamily: "var(--font-display)", fontWeight: 900, fontSize: 24 }}>দোকানের হিসাব</div>
          <div className="text-sm mt-1" style={{ color: "var(--ink-faint)" }}>{mode === "login" ? "দোকানের অ্যাকাউন্টে লগইন করুন" : "দোকানের জন্য নতুন অ্যাকাউন্ট বানান"}</div>
        </div>
        <div className="flex flex-col gap-3">
          <input type="email" required className="field" placeholder="ইমেইল" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input type="password" required minLength={6} className="field" placeholder="পাসওয়ার্ড (কমপক্ষে ৬ ঘর)" value={password} onChange={(e) => setPassword(e.target.value)} />
        </div>
        {err && <div className="text-sm mt-3" style={{ color: "var(--stamp)" }}>{err}</div>}
        <button type="submit" disabled={busy} className="ledger-btn ledger-btn-solid w-full justify-center mt-4">
          {busy ? "অপেক্ষা করুন…" : mode === "login" ? "লগইন করুন" : "অ্যাকাউন্ট তৈরি করুন"}
        </button>
        <div className="text-center mt-3">
          <button type="button" className="text-xs underline" style={{ color: "var(--ink-faint)" }} onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(""); }}>
            {mode === "login" ? "দোকানের প্রথমবার লগইন? নতুন অ্যাকাউন্ট বানান" : "আগে থেকেই অ্যাকাউন্ট আছে? লগইন করুন"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ---------- top-level App ----------
// এই সফটওয়্যারটা শুধু একটা দোকানের জন্য — তাই কোনো "দোকান-কোড দিয়ে লগইন/join" স্ক্রিন নেই।
// আগে মাল্টি-ব্রাঞ্চ সাপোর্টের জন্য ShopGate কম্পোনেন্ট একটা কোড চাইতো, সেটা বাদ দিয়ে
// এখন একটা ফিক্সড শপ-কোড সরাসরি ব্যবহার করা হচ্ছে — অ্যাপ খুললেই সরাসরি দোকানে ঢুকে যাবে।
const SINGLE_SHOP_CODE = "MAIN-SHOP";
export default function App() {
  return <DokanApp shopCode={SINGLE_SHOP_CODE} onShopLogout={undefined} />;
}
