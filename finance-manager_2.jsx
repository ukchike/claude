import { useState, useEffect, useCallback, useRef } from "react";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, Legend } from "recharts";
import * as Papa from "papaparse";
import * as XLSX from "sheetjs";
import { Upload, Plus, TrendingUp, TrendingDown, Wallet, Target, BarChart3, List, Settings, ChevronDown, X, Check, AlertTriangle, Loader2, FileSpreadsheet, Brain, Edit3, Trash2, Search, Filter, ArrowUpRight, ArrowDownRight, RefreshCw, CreditCard, Building2, PiggyBank, DollarSign } from "lucide-react";

const CATEGORIES = {
  income: ["Salary", "Freelance", "Consulting", "Investment Returns", "Refund", "Gift", "Other Income"],
  expense: ["Groceries", "Transport", "Utilities", "Airtime/Data", "Dining Out", "Entertainment", "Shopping", "Healthcare", "Education", "Rent/Housing", "Insurance", "Subscriptions", "POS Purchase", "ATM Withdrawal", "Bank Charges", "Transfer Out", "Loan Repayment", "Donations", "Personal Care", "Other Expense"]
};

const CATEGORY_COLORS = {
  "Salary": "#22c55e", "Freelance": "#3b82f6", "Consulting": "#8b5cf6", "Investment Returns": "#06b6d4",
  "Groceries": "#ef4444", "Transport": "#f97316", "Utilities": "#eab308", "Airtime/Data": "#ec4899",
  "Dining Out": "#f43f5e", "Entertainment": "#a855f7", "Shopping": "#6366f1", "Healthcare": "#14b8a6",
  "Education": "#0ea5e9", "Rent/Housing": "#d946ef", "Insurance": "#64748b", "Subscriptions": "#84cc16",
  "POS Purchase": "#fb923c", "ATM Withdrawal": "#94a3b8", "Bank Charges": "#dc2626", "Transfer Out": "#7c3aed",
  "Loan Repayment": "#b91c1c", "Donations": "#059669", "Personal Care": "#db2777",
  "Refund": "#10b981", "Gift": "#f59e0b", "Other Income": "#6b7280", "Other Expense": "#9ca3af"
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const formatCurrency = (amt) => {
  if (amt === undefined || amt === null) return "₦0.00";
  return "₦" + Number(amt).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2, 9);

const parseDate = (d) => {
  if (!d) return new Date().toISOString().split("T")[0];
  if (typeof d === "number") {
    const date = new Date((d - 25569) * 86400 * 1000);
    return date.toISOString().split("T")[0];
  }
  const str = String(d).trim();
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})/, /^(\d{2})\/(\d{2})\/(\d{4})/, /^(\d{2})-(\d{2})-(\d{4})/,
    /^(\d{2})-(\w{3})-(\d{4})/, /^(\d{2})\/(\w{3})\/(\d{4})/
  ];
  try {
    const parsed = new Date(str);
    if (!isNaN(parsed)) return parsed.toISOString().split("T")[0];
  } catch {}
  return new Date().toISOString().split("T")[0];
};

const DEFAULT_ACCOUNTS = [
  { id: "acc_1", name: "Main Account", type: "bank", bank: "GTBank", balance: 0, color: "#f97316" },
  { id: "acc_2", name: "Savings", type: "savings", bank: "Access Bank", balance: 0, color: "#22c55e" },
];

const DEFAULT_BUDGETS = [
  { id: "b1", category: "Groceries", limit: 50000, period: "monthly" },
  { id: "b2", category: "Transport", limit: 30000, period: "monthly" },
  { id: "b3", category: "Dining Out", limit: 20000, period: "monthly" },
  { id: "b4", category: "Utilities", limit: 25000, period: "monthly" },
];

// AI Classification
async function classifyTransactions(transactions) {
  const descs = transactions.map((t, i) => `${i + 1}. "${t.description}" | Amount: ${t.amount}`).join("\n");
  const cats = [...CATEGORIES.income, ...CATEGORIES.expense].join(", ");

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `You are a Nigerian bank transaction classifier. Classify each transaction into exactly one category.

Categories: ${cats}

Transactions:
${descs}

Respond ONLY with a JSON array of objects with "index" (1-based) and "category" fields. No markdown, no explanation.
Example: [{"index":1,"category":"Groceries"},{"index":2,"category":"Salary"}]`
        }]
      })
    });
    const data = await response.json();
    const text = data.content?.map(c => c.text || "").join("") || "";
    const clean = text.replace(/```json|```/g, "").trim();
    return JSON.parse(clean);
  } catch (err) {
    console.error("Classification error:", err);
    return null;
  }
}

function guessCategory(desc) {
  const d = (desc || "").toLowerCase();
  if (/salary|wage|pay\s?roll/.test(d)) return "Salary";
  if (/freelance|upwork|fiverr/.test(d)) return "Freelance";
  if (/consult/.test(d)) return "Consulting";
  if (/interest|dividend|return/.test(d)) return "Investment Returns";
  if (/refund|reversal|cashback/.test(d)) return "Refund";
  if (/shoprite|spar|market|grocery/.test(d)) return "Groceries";
  if (/uber|bolt|taxi|fuel|petrol|transport|fare/.test(d)) return "Transport";
  if (/dstv|gotv|phcn|ekedc|ikedc|nepa|electric|water|waste/.test(d)) return "Utilities";
  if (/airtime|mtn|glo|airtel|9mobile|data|recharge/.test(d)) return "Airtime/Data";
  if (/restaurant|food|chicken|pizza|eat|eatery|bukka/.test(d)) return "Dining Out";
  if (/netflix|spotify|cinema|movie|game/.test(d)) return "Entertainment";
  if (/pos|purchase|buy|shop|store|mall/.test(d)) return "POS Purchase";
  if (/atm|withdraw|cash/.test(d)) return "ATM Withdrawal";
  if (/charge|fee|stamp|vat|sms|maintenance/.test(d)) return "Bank Charges";
  if (/transfer|trf|nip|send/.test(d)) return "Transfer Out";
  if (/loan|repay|mortgage/.test(d)) return "Loan Repayment";
  if (/school|tuition|course|exam|book|study/.test(d)) return "Education";
  if (/hospital|clinic|pharm|drug|health|medical/.test(d)) return "Healthcare";
  if (/rent|house|estate|accommodation/.test(d)) return "Rent/Housing";
  if (/insurance|hmo/.test(d)) return "Insurance";
  if (/subscription|sub\s/.test(d)) return "Subscriptions";
  if (/donate|tithe|offering|church|mosque/.test(d)) return "Donations";
  return null;
}

function parseStatement(rawData, fileName) {
  const rows = Array.isArray(rawData) ? rawData : [];
  if (rows.length < 2) return [];

  const headers = rows[0] ? Object.values(rows[0]).map(h => String(h || "").toLowerCase().trim()) : [];
  const colMap = { date: -1, desc: -1, debit: -1, credit: -1, amount: -1, balance: -1 };

  headers.forEach((h, i) => {
    if (/date|trans.*date|value.*date|posting/i.test(h)) colMap.date = i;
    if (/desc|narr|detail|particular|remark|reference/i.test(h)) colMap.desc = i;
    if (/debit|withdrawal|dr|outflow/i.test(h)) colMap.debit = i;
    if (/credit|deposit|cr|inflow/i.test(h)) colMap.credit = i;
    if (/^amount$|^value$/i.test(h)) colMap.amount = i;
    if (/balance/i.test(h)) colMap.balance = i;
  });

  const keys = rows[0] ? Object.keys(rows[0]) : [];
  const transactions = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const vals = keys.map(k => row[k]);

    const dateVal = colMap.date >= 0 ? vals[colMap.date] : null;
    const descVal = colMap.desc >= 0 ? vals[colMap.desc] : vals.find(v => typeof v === "string" && v.length > 3) || "";
    
    let amount = 0;
    let type = "expense";

    if (colMap.debit >= 0 && colMap.credit >= 0) {
      const debit = parseFloat(String(vals[colMap.debit] || "0").replace(/[^0-9.-]/g, "")) || 0;
      const credit = parseFloat(String(vals[colMap.credit] || "0").replace(/[^0-9.-]/g, "")) || 0;
      if (credit > 0) { amount = credit; type = "income"; }
      else if (debit > 0) { amount = debit; type = "expense"; }
      else continue;
    } else if (colMap.amount >= 0) {
      amount = parseFloat(String(vals[colMap.amount] || "0").replace(/[^0-9.-]/g, "")) || 0;
      if (amount > 0) type = "income"; else { type = "expense"; amount = Math.abs(amount); }
    } else continue;

    if (amount === 0) continue;

    const desc = String(descVal || "").trim();
    if (!desc) continue;

    transactions.push({
      id: generateId(),
      date: parseDate(dateVal),
      description: desc,
      amount,
      type,
      category: guessCategory(desc) || (type === "income" ? "Other Income" : "Other Expense"),
      source: fileName || "Upload",
      classified: false
    });
  }
  return transactions;
}

// Components
function StatCard({ icon: Icon, label, value, trend, trendUp, color }) {
  return (
    <div style={{
      background: "var(--card-bg)", borderRadius: 16, padding: "20px 24px",
      border: "1px solid var(--border)", flex: "1 1 200px", minWidth: 200
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12, background: color + "18",
          display: "flex", alignItems: "center", justifyContent: "center"
        }}>
          <Icon size={20} color={color} />
        </div>
        {trend !== undefined && (
          <div style={{
            display: "flex", alignItems: "center", gap: 2, fontSize: 12, fontWeight: 600,
            color: trendUp ? "#22c55e" : "#ef4444"
          }}>
            {trendUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {trend}%
          </div>
        )}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 4, fontWeight: 500 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--text-primary)", letterSpacing: "-0.5px" }}>{value}</div>
    </div>
  );
}

function BudgetBar({ category, spent, limit }) {
  const pct = Math.min((spent / limit) * 100, 100);
  const over = spent > limit;
  const clr = over ? "#ef4444" : pct > 80 ? "#f59e0b" : "#22c55e";
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{category}</span>
        <span style={{ fontSize: 12, color: over ? "#ef4444" : "var(--text-muted)", fontWeight: 500 }}>
          {formatCurrency(spent)} / {formatCurrency(limit)}
          {over && " ⚠️"}
        </span>
      </div>
      <div style={{ height: 8, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
        <div style={{
          height: "100%", width: pct + "%", borderRadius: 4, background: clr,
          transition: "width 0.6s ease"
        }} />
      </div>
    </div>
  );
}

// Main App
export default function FinanceManager() {
  const [view, setView] = useState("dashboard");
  const [transactions, setTransactions] = useState([]);
  const [accounts, setAccounts] = useState(DEFAULT_ACCOUNTS);
  const [budgets, setBudgets] = useState(DEFAULT_BUDGETS);
  const [showUpload, setShowUpload] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  const [showAddBudget, setShowAddBudget] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [filterAccount, setFilterAccount] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [editingTx, setEditingTx] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingClassification, setPendingClassification] = useState([]);
  const fileRef = useRef(null);

  // Persistence
  useEffect(() => {
    (async () => {
      try {
        const [txRes, accRes, budRes] = await Promise.all([
          window.storage.get("fm_transactions").catch(() => null),
          window.storage.get("fm_accounts").catch(() => null),
          window.storage.get("fm_budgets").catch(() => null)
        ]);
        if (txRes?.value) setTransactions(JSON.parse(txRes.value));
        if (accRes?.value) setAccounts(JSON.parse(accRes.value));
        if (budRes?.value) setBudgets(JSON.parse(budRes.value));
      } catch {}
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!loading) {
      window.storage.set("fm_transactions", JSON.stringify(transactions)).catch(() => {});
    }
  }, [transactions, loading]);

  useEffect(() => {
    if (!loading) window.storage.set("fm_accounts", JSON.stringify(accounts)).catch(() => {});
  }, [accounts, loading]);

  useEffect(() => {
    if (!loading) window.storage.set("fm_budgets", JSON.stringify(budgets)).catch(() => {});
  }, [budgets, loading]);

  // File handling
  const handleFile = useCallback(async (file) => {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    let rows = [];

    try {
      if (ext === "csv" || ext === "tsv") {
        const text = await file.text();
        const result = Papa.parse(text, { header: true, skipEmptyLines: true });
        rows = result.data;
      } else if (["xlsx", "xls", "xlsm"].includes(ext)) {
        const buf = await file.arrayBuffer();
        const wb = XLSX.read(buf, { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      } else {
        setUploadResult({ success: false, msg: "Unsupported format. Please upload CSV or Excel files." });
        return;
      }

      const parsed = parseStatement(rows, file.name);
      if (parsed.length === 0) {
        setUploadResult({ success: false, msg: "No transactions found. Please check the file format." });
        return;
      }

      setPendingClassification(parsed);
      setUploadResult({
        success: true,
        msg: `Found ${parsed.length} transactions from "${file.name}". Ready for AI classification.`,
        count: parsed.length
      });
    } catch (err) {
      console.error(err);
      setUploadResult({ success: false, msg: "Error reading file: " + err.message });
    }
  }, []);

  const runAIClassification = useCallback(async () => {
    if (pendingClassification.length === 0) return;
    setClassifying(true);

    const batches = [];
    for (let i = 0; i < pendingClassification.length; i += 20) {
      batches.push(pendingClassification.slice(i, i + 20));
    }

    let classified = [...pendingClassification];
    for (const batch of batches) {
      const result = await classifyTransactions(batch);
      if (result) {
        result.forEach(r => {
          const idx = r.index - 1;
          const globalIdx = pendingClassification.indexOf(batch[idx]);
          if (globalIdx >= 0) {
            classified[globalIdx] = { ...classified[globalIdx], category: r.category, classified: true };
          }
        });
      }
    }

    setTransactions(prev => [...prev, ...classified]);
    setPendingClassification([]);
    setClassifying(false);
    setUploadResult({ success: true, msg: `${classified.length} transactions classified and added!`, done: true });
  }, [pendingClassification]);

  const addWithoutAI = useCallback(() => {
    setTransactions(prev => [...prev, ...pendingClassification]);
    setPendingClassification([]);
    setUploadResult({ success: true, msg: `${pendingClassification.length} transactions added with rule-based categories.`, done: true });
  }, [pendingClassification]);

  // Filters
  const filteredTx = transactions.filter(t => {
    const d = new Date(t.date);
    if (d.getMonth() !== selectedMonth || d.getFullYear() !== selectedYear) return false;
    if (filterType !== "all" && t.type !== filterType) return false;
    if (filterCategory !== "all" && t.category !== filterCategory) return false;
    if (filterAccount !== "all" && t.accountId !== filterAccount) return false;
    if (searchTerm && !t.description.toLowerCase().includes(searchTerm.toLowerCase())) return false;
    return true;
  });

  const monthIncome = filteredTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const monthExpense = filteredTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const netFlow = monthIncome - monthExpense;

  const categoryData = {};
  filteredTx.filter(t => t.type === "expense").forEach(t => {
    categoryData[t.category] = (categoryData[t.category] || 0) + t.amount;
  });
  const pieData = Object.entries(categoryData)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);

  // Monthly trend (last 6 months)
  const trendData = [];
  for (let i = 5; i >= 0; i--) {
    let m = selectedMonth - i;
    let y = selectedYear;
    if (m < 0) { m += 12; y--; }
    const mTx = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getMonth() === m && d.getFullYear() === y;
    });
    trendData.push({
      month: MONTHS[m],
      income: mTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0),
      expense: mTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0)
    });
  }

  // Budget spending for current month
  const budgetSpending = budgets.map(b => {
    const spent = filteredTx.filter(t => t.type === "expense" && t.category === b.category).reduce((s, t) => s + t.amount, 0);
    return { ...b, spent };
  });

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);

  const navItems = [
    { id: "dashboard", icon: BarChart3, label: "Dashboard" },
    { id: "transactions", icon: List, label: "Transactions" },
    { id: "budgets", icon: Target, label: "Budgets" },
    { id: "accounts", icon: CreditCard, label: "Accounts" },
  ];

  // New transaction form
  const [newTx, setNewTx] = useState({
    date: new Date().toISOString().split("T")[0], description: "", amount: "",
    type: "expense", category: "Other Expense", accountId: accounts[0]?.id || ""
  });

  const handleAddTx = () => {
    if (!newTx.description || !newTx.amount) return;
    const tx = {
      id: generateId(), ...newTx, amount: parseFloat(newTx.amount),
      source: "Manual", classified: true
    };
    setTransactions(prev => [...prev, tx]);
    setNewTx({
      date: new Date().toISOString().split("T")[0], description: "", amount: "",
      type: "expense", category: "Other Expense", accountId: accounts[0]?.id || ""
    });
    setShowAddTx(false);
  };

  const deleteTx = (id) => setTransactions(prev => prev.filter(t => t.id !== id));

  const updateTxCategory = (id, cat) => {
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, category: cat, classified: true } : t));
    setEditingTx(null);
  };

  const [newBudget, setNewBudget] = useState({ category: "Groceries", limit: "" });

  const resetAll = async () => {
    if (confirm("This will clear ALL data. Are you sure?")) {
      setTransactions([]); setAccounts(DEFAULT_ACCOUNTS); setBudgets(DEFAULT_BUDGETS);
      try {
        await window.storage.delete("fm_transactions");
        await window.storage.delete("fm_accounts");
        await window.storage.delete("fm_budgets");
      } catch {}
    }
  };

  if (loading) {
    return (
      <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0c0f1a", color: "#e2e8f0" }}>
        <Loader2 size={32} className="animate-spin" style={{ animation: "spin 1s linear infinite" }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      "--bg": "#0c0f1a", "--card-bg": "#151929", "--border": "#1e2640", "--text-primary": "#e2e8f0",
      "--text-muted": "#8896b3", "--accent": "#3b82f6", "--accent-hover": "#2563eb", "--success": "#22c55e",
      "--danger": "#ef4444", "--warning": "#f59e0b",
      fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
      background: "var(--bg)", color: "var(--text-primary)", minHeight: "100vh",
      display: "flex", flexDirection: "column"
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1e2640; border-radius: 3px; }
        input, select, textarea {
          background: #0c0f1a; border: 1px solid var(--border); color: var(--text-primary);
          padding: 10px 14px; border-radius: 10px; font-size: 14px; font-family: inherit;
          outline: none; width: 100%; transition: border-color 0.2s;
        }
        input:focus, select:focus { border-color: var(--accent); }
        select { cursor: pointer; }
        .btn {
          padding: 10px 20px; border-radius: 10px; font-size: 14px; font-weight: 600;
          cursor: pointer; border: none; font-family: inherit; transition: all 0.2s;
          display: inline-flex; align-items: center; gap: 8px;
        }
        .btn-primary { background: var(--accent); color: white; }
        .btn-primary:hover { background: var(--accent-hover); transform: translateY(-1px); }
        .btn-ghost { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }
        .btn-ghost:hover { background: #1e2640; color: var(--text-primary); }
        .btn-success { background: var(--success); color: white; }
        .btn-danger { background: var(--danger); color: white; }
        .modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100;
          display: flex; align-items: center; justify-content: center; padding: 20px;
          backdrop-filter: blur(4px);
        }
        .modal {
          background: var(--card-bg); border-radius: 20px; padding: 28px;
          max-width: 520px; width: 100%; border: 1px solid var(--border);
          max-height: 90vh; overflow-y: auto;
        }
        .fade-in { animation: fadeIn 0.3s ease; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .nav-item {
          display: flex; align-items: center; gap: 10px; padding: 10px 16px;
          border-radius: 12px; cursor: pointer; transition: all 0.2s; font-weight: 500; font-size: 14px;
          color: var(--text-muted); border: none; background: none; font-family: inherit; width: 100%;
        }
        .nav-item:hover { background: #1e2640; color: var(--text-primary); }
        .nav-item.active { background: var(--accent); color: white; }
        .drop-zone {
          border: 2px dashed var(--border); border-radius: 16px; padding: 40px 20px;
          text-align: center; cursor: pointer; transition: all 0.3s;
        }
        .drop-zone:hover, .drop-zone.dragover { border-color: var(--accent); background: rgba(59,130,246,0.05); }
      `}</style>

      {/* Header */}
      <header style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "16px 24px", borderBottom: "1px solid var(--border)", background: "var(--card-bg)"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <Wallet size={20} color="white" />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-0.3px" }}>FinanceFlow</div>
            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Smart Money Manager</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowUpload(true)} style={{ fontSize: 13 }}>
            <Upload size={16} /> Upload Statement
          </button>
          <button className="btn btn-primary" onClick={() => setShowAddTx(true)} style={{ fontSize: 13 }}>
            <Plus size={16} /> Add
          </button>
        </div>
      </header>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Sidebar */}
        <nav style={{
          width: 200, padding: "16px 12px", borderRight: "1px solid var(--border)",
          display: "flex", flexDirection: "column", gap: 4, background: "var(--card-bg)"
        }}>
          {navItems.map(n => (
            <button key={n.id} className={`nav-item ${view === n.id ? "active" : ""}`}
              onClick={() => setView(n.id)}>
              <n.icon size={18} /> {n.label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button className="nav-item" onClick={resetAll} style={{ color: "#ef4444", fontSize: 12 }}>
            <Trash2 size={16} /> Reset Data
          </button>
        </nav>

        {/* Main Content */}
        <main style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {/* Month Selector */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <select value={selectedMonth} onChange={e => setSelectedMonth(+e.target.value)}
              style={{ width: 120 }}>
              {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
            </select>
            <select value={selectedYear} onChange={e => setSelectedYear(+e.target.value)}
              style={{ width: 100 }}>
              {[2024, 2025, 2026].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* DASHBOARD */}
          {view === "dashboard" && (
            <div className="fade-in">
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
                <StatCard icon={TrendingUp} label="Income" value={formatCurrency(monthIncome)} color="#22c55e" />
                <StatCard icon={TrendingDown} label="Expenses" value={formatCurrency(monthExpense)} color="#ef4444" />
                <StatCard icon={DollarSign} label="Net Flow" value={formatCurrency(netFlow)}
                  color={netFlow >= 0 ? "#22c55e" : "#ef4444"} />
                <StatCard icon={Wallet} label="Total Balance" value={formatCurrency(totalBalance)} color="#3b82f6" />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
                {/* Income vs Expense Trend */}
                <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)" }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>6-Month Trend</h3>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e2640" />
                      <XAxis dataKey="month" tick={{ fill: "#8896b3", fontSize: 12 }} />
                      <YAxis tick={{ fill: "#8896b3", fontSize: 11 }} tickFormatter={v => "₦" + (v/1000) + "k"} />
                      <Tooltip contentStyle={{ background: "#151929", border: "1px solid #1e2640", borderRadius: 10, fontSize: 13 }}
                        formatter={(v) => formatCurrency(v)} />
                      <Bar dataKey="income" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="expense" fill="#ef4444" radius={[4, 4, 0, 0]} />
                      <Legend />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Spending by Category */}
                <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)" }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 20 }}>Spending by Category</h3>
                  {pieData.length > 0 ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                      <ResponsiveContainer width="50%" height={220}>
                        <PieChart>
                          <Pie data={pieData} innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={2}>
                            {pieData.map((d, i) => (
                              <Cell key={i} fill={CATEGORY_COLORS[d.name] || "#6366f1"} />
                            ))}
                          </Pie>
                          <Tooltip contentStyle={{ background: "#151929", border: "1px solid #1e2640", borderRadius: 10, fontSize: 12 }}
                            formatter={(v) => formatCurrency(v)} />
                        </PieChart>
                      </ResponsiveContainer>
                      <div style={{ flex: 1, maxHeight: 220, overflow: "auto" }}>
                        {pieData.slice(0, 6).map(d => (
                          <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 12 }}>
                            <div style={{ width: 10, height: 10, borderRadius: 3, background: CATEGORY_COLORS[d.name] || "#6366f1", flexShrink: 0 }} />
                            <span style={{ color: "var(--text-muted)", flex: 1 }}>{d.name}</span>
                            <span style={{ fontWeight: 600 }}>{formatCurrency(d.value)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 40 }}>
                      No expense data for this month
                    </div>
                  )}
                </div>
              </div>

              {/* Budget Overview */}
              <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)", marginBottom: 24 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700 }}>Budget Tracker</h3>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}
                    onClick={() => setView("budgets")}>View All</button>
                </div>
                {budgetSpending.length > 0 ? budgetSpending.map(b => (
                  <BudgetBar key={b.id} category={b.category} spent={b.spent} limit={b.limit} />
                )) : <div style={{ color: "var(--text-muted)", fontSize: 13 }}>No budgets set</div>}
              </div>

              {/* Recent Transactions */}
              <div style={{ background: "var(--card-bg)", borderRadius: 16, padding: 24, border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 700 }}>Recent Transactions</h3>
                  <button className="btn btn-ghost" style={{ fontSize: 12, padding: "6px 12px" }}
                    onClick={() => setView("transactions")}>View All</button>
                </div>
                {filteredTx.slice(0, 8).map(t => (
                  <div key={t.id} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "10px 0",
                    borderBottom: "1px solid var(--border)"
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: t.type === "income" ? "#22c55e18" : "#ef444418",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                    }}>
                      {t.type === "income" ? <ArrowDownRight size={16} color="#22c55e" /> : <ArrowUpRight size={16} color="#ef4444" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t.description}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t.category} · {t.date}</div>
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: 700,
                      color: t.type === "income" ? "#22c55e" : "#ef4444"
                    }}>
                      {t.type === "income" ? "+" : "-"}{formatCurrency(t.amount)}
                    </div>
                  </div>
                ))}
                {filteredTx.length === 0 && (
                  <div style={{ textAlign: "center", color: "var(--text-muted)", padding: 40, fontSize: 14 }}>
                    No transactions this month. Upload a bank statement or add one manually!
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TRANSACTIONS */}
          {view === "transactions" && (
            <div className="fade-in">
              <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
                <div style={{ position: "relative", flex: "1 1 200px" }}>
                  <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: "var(--text-muted)" }} />
                  <input placeholder="Search transactions..." value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ paddingLeft: 36 }} />
                </div>
                <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 130 }}>
                  <option value="all">All Types</option>
                  <option value="income">Income</option>
                  <option value="expense">Expense</option>
                </select>
                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ width: 160 }}>
                  <option value="all">All Categories</option>
                  {[...CATEGORIES.income, ...CATEGORIES.expense].map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>
                {filteredTx.length} transactions · Income: {formatCurrency(monthIncome)} · Expenses: {formatCurrency(monthExpense)}
              </div>

              <div style={{ background: "var(--card-bg)", borderRadius: 16, border: "1px solid var(--border)", overflow: "hidden" }}>
                {filteredTx.sort((a, b) => b.date.localeCompare(a.date)).map(t => (
                  <div key={t.id} style={{
                    display: "flex", alignItems: "center", gap: 12, padding: "14px 20px",
                    borderBottom: "1px solid var(--border)", transition: "background 0.2s"
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = "#1e2640"}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: t.type === "income" ? "#22c55e18" : "#ef444418",
                      display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                    }}>
                      {t.type === "income" ? <ArrowDownRight size={16} color="#22c55e" /> : <ArrowUpRight size={16} color="#ef4444" />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {t.description}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {t.date} · {t.source}
                        {!t.classified && <span style={{ color: "#f59e0b", marginLeft: 6 }}>⚡ Rule-based</span>}
                      </div>
                    </div>
                    {editingTx === t.id ? (
                      <select value={t.category} onChange={e => updateTxCategory(t.id, e.target.value)}
                        onBlur={() => setEditingTx(null)}
                        autoFocus style={{ width: 150, fontSize: 12 }}>
                        {[...(t.type === "income" ? CATEGORIES.income : CATEGORIES.expense)].map(c => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    ) : (
                      <button onClick={() => setEditingTx(t.id)}
                        style={{
                          background: (CATEGORY_COLORS[t.category] || "#6366f1") + "20",
                          color: CATEGORY_COLORS[t.category] || "#6366f1",
                          border: "none", padding: "4px 10px", borderRadius: 6, fontSize: 11,
                          fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap"
                        }}>
                        {t.category}
                      </button>
                    )}
                    <div style={{
                      fontSize: 14, fontWeight: 700, minWidth: 100, textAlign: "right",
                      color: t.type === "income" ? "#22c55e" : "#ef4444"
                    }}>
                      {t.type === "income" ? "+" : "-"}{formatCurrency(t.amount)}
                    </div>
                    <button onClick={() => deleteTx(t.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", padding: 4 }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {filteredTx.length === 0 && (
                  <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
                    <FileSpreadsheet size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
                    <div style={{ fontSize: 14 }}>No transactions found</div>
                    <div style={{ fontSize: 12, marginTop: 4 }}>Upload a bank statement or add transactions manually</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* BUDGETS */}
          {view === "budgets" && (
            <div className="fade-in">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>Budget Management</h2>
                <button className="btn btn-primary" onClick={() => setShowAddBudget(true)} style={{ fontSize: 13 }}>
                  <Plus size={16} /> Add Budget
                </button>
              </div>

              <div style={{ display: "grid", gap: 16 }}>
                {budgetSpending.map(b => {
                  const pct = b.limit > 0 ? (b.spent / b.limit * 100) : 0;
                  const over = b.spent > b.limit;
                  return (
                    <div key={b.id} style={{
                      background: "var(--card-bg)", borderRadius: 16, padding: 24,
                      border: over ? "1px solid #ef444440" : "1px solid var(--border)"
                    }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{
                            width: 10, height: 10, borderRadius: 3,
                            background: CATEGORY_COLORS[b.category] || "#6366f1"
                          }} />
                          <span style={{ fontWeight: 700, fontSize: 15 }}>{b.category}</span>
                          {over && <AlertTriangle size={16} color="#ef4444" />}
                        </div>
                        <button onClick={() => setBudgets(prev => prev.filter(x => x.id !== b.id))}
                          style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer" }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                      <BudgetBar category="" spent={b.spent} limit={b.limit} />
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                        <span>{pct.toFixed(0)}% used</span>
                        <span>{over ? `Over by ${formatCurrency(b.spent - b.limit)}` : `${formatCurrency(b.limit - b.spent)} remaining`}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ACCOUNTS */}
          {view === "accounts" && (
            <div className="fade-in">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ fontSize: 18, fontWeight: 700 }}>Accounts</h2>
                <button className="btn btn-primary" onClick={() => {
                  const name = prompt("Account name:");
                  if (name) {
                    setAccounts(prev => [...prev, {
                      id: generateId(), name, type: "bank", bank: "Other", balance: 0,
                      color: "#" + Math.floor(Math.random()*16777215).toString(16).padStart(6, "0")
                    }]);
                  }
                }} style={{ fontSize: 13 }}>
                  <Plus size={16} /> Add Account
                </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                {accounts.map(a => {
                  const accIcon = a.type === "savings" ? PiggyBank : a.type === "credit" ? CreditCard : Building2;
                  const AccIcon = accIcon;
                  return (
                    <div key={a.id} style={{
                      background: "var(--card-bg)", borderRadius: 16, padding: 24,
                      border: "1px solid var(--border)"
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                        <div style={{
                          width: 44, height: 44, borderRadius: 12, background: a.color + "20",
                          display: "flex", alignItems: "center", justifyContent: "center"
                        }}>
                          <AccIcon size={22} color={a.color} />
                        </div>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 15 }}>{a.name}</div>
                          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.bank}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-1px" }}>
                        {formatCurrency(a.balance)}
                      </div>
                      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "6px 12px" }}
                          onClick={() => {
                            const bal = prompt("Set balance:", a.balance);
                            if (bal !== null) {
                              setAccounts(prev => prev.map(x => x.id === a.id ? { ...x, balance: parseFloat(bal) || 0 } : x));
                            }
                          }}>
                          <Edit3 size={12} /> Edit Balance
                        </button>
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: "6px 12px", color: "#ef4444" }}
                          onClick={() => setAccounts(prev => prev.filter(x => x.id !== a.id))}>
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* UPLOAD MODAL */}
      {showUpload && (
        <div className="modal-overlay" onClick={() => { setShowUpload(false); setUploadResult(null); setPendingClassification([]); }}>
          <div className="modal fade-in" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>Upload Bank Statement</h3>
              <button onClick={() => { setShowUpload(false); setUploadResult(null); setPendingClassification([]); }}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            <div className="drop-zone"
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add("dragover"); }}
              onDragLeave={e => e.currentTarget.classList.remove("dragover")}
              onDrop={e => { e.preventDefault(); e.currentTarget.classList.remove("dragover"); handleFile(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current?.click()}>
              <Upload size={36} color="var(--text-muted)" style={{ marginBottom: 12 }} />
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
                Drop your bank statement here
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                Supports CSV, Excel (.xlsx, .xls) formats
              </div>
              <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls,.xlsm,.tsv" hidden
                onChange={e => handleFile(e.target.files[0])} />
            </div>

            {uploadResult && (
              <div style={{
                marginTop: 16, padding: 16, borderRadius: 12,
                background: uploadResult.success ? "#22c55e10" : "#ef444410",
                border: `1px solid ${uploadResult.success ? "#22c55e30" : "#ef444430"}`
              }}>
                <div style={{
                  display: "flex", alignItems: "center", gap: 8, fontSize: 13,
                  color: uploadResult.success ? "#22c55e" : "#ef4444", fontWeight: 600
                }}>
                  {uploadResult.success ? <Check size={16} /> : <AlertTriangle size={16} />}
                  {uploadResult.msg}
                </div>
              </div>
            )}

            {pendingClassification.length > 0 && !classifying && !uploadResult?.done && (
              <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
                <button className="btn btn-primary" onClick={runAIClassification} style={{ flex: 1 }}>
                  <Brain size={16} /> Classify with AI
                </button>
                <button className="btn btn-ghost" onClick={addWithoutAI} style={{ flex: 1 }}>
                  <Check size={16} /> Use Rule-Based
                </button>
              </div>
            )}

            {classifying && (
              <div style={{ marginTop: 20, textAlign: "center" }}>
                <Loader2 size={24} color="var(--accent)" style={{ animation: "spin 1s linear infinite", marginBottom: 8 }} />
                <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
                  AI is classifying your transactions...
                </div>
              </div>
            )}

            {uploadResult?.done && (
              <button className="btn btn-primary" style={{ marginTop: 16, width: "100%", justifyContent: "center" }}
                onClick={() => { setShowUpload(false); setUploadResult(null); setView("transactions"); }}>
                View Transactions
              </button>
            )}

            <div style={{ marginTop: 20, padding: 16, background: "#0c0f1a", borderRadius: 12, fontSize: 12, color: "var(--text-muted)" }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: "var(--text-primary)" }}>Supported Bank Formats</div>
              Any CSV or Excel export from Nigerian banks (GTBank, Access, First Bank, UBA, Zenith, Stanbic, Fidelity, etc.) or international banks. 
              The parser auto-detects columns like Date, Description/Narration, Debit, Credit, and Balance.
            </div>
          </div>
        </div>
      )}

      {/* ADD TRANSACTION MODAL */}
      {showAddTx && (
        <div className="modal-overlay" onClick={() => setShowAddTx(false)}>
          <div className="modal fade-in" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>Add Transaction</h3>
              <button onClick={() => setShowAddTx(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {["expense", "income"].map(t => (
                <button key={t} onClick={() => setNewTx(prev => ({
                  ...prev, type: t,
                  category: t === "income" ? "Other Income" : "Other Expense"
                }))}
                  style={{
                    flex: 1, padding: "10px", borderRadius: 10, border: "1px solid",
                    borderColor: newTx.type === t ? (t === "income" ? "#22c55e" : "#ef4444") : "var(--border)",
                    background: newTx.type === t ? (t === "income" ? "#22c55e15" : "#ef444415") : "transparent",
                    color: newTx.type === t ? (t === "income" ? "#22c55e" : "#ef4444") : "var(--text-muted)",
                    cursor: "pointer", fontWeight: 600, fontSize: 14, fontFamily: "inherit"
                  }}>
                  {t === "income" ? "Income" : "Expense"}
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gap: 12 }}>
              <input type="date" value={newTx.date} onChange={e => setNewTx(p => ({ ...p, date: e.target.value }))} />
              <input placeholder="Description" value={newTx.description}
                onChange={e => setNewTx(p => ({ ...p, description: e.target.value }))} />
              <input type="number" placeholder="Amount (₦)" value={newTx.amount}
                onChange={e => setNewTx(p => ({ ...p, amount: e.target.value }))} />
              <select value={newTx.category}
                onChange={e => setNewTx(p => ({ ...p, category: e.target.value }))}>
                {(newTx.type === "income" ? CATEGORIES.income : CATEGORIES.expense).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <select value={newTx.accountId}
                onChange={e => setNewTx(p => ({ ...p, accountId: e.target.value }))}>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>

            <button className="btn btn-primary" onClick={handleAddTx}
              disabled={!newTx.description || !newTx.amount}
              style={{ marginTop: 20, width: "100%", justifyContent: "center", opacity: (!newTx.description || !newTx.amount) ? 0.5 : 1 }}>
              <Plus size={16} /> Add Transaction
            </button>
          </div>
        </div>
      )}

      {/* ADD BUDGET MODAL */}
      {showAddBudget && (
        <div className="modal-overlay" onClick={() => setShowAddBudget(false)}>
          <div className="modal fade-in" onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h3 style={{ fontSize: 18, fontWeight: 700 }}>Add Budget</h3>
              <button onClick={() => setShowAddBudget(false)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer" }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ display: "grid", gap: 12 }}>
              <select value={newBudget.category} onChange={e => setNewBudget(p => ({ ...p, category: e.target.value }))}>
                {CATEGORIES.expense.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="number" placeholder="Monthly budget limit (₦)" value={newBudget.limit}
                onChange={e => setNewBudget(p => ({ ...p, limit: e.target.value }))} />
            </div>
            <button className="btn btn-primary" style={{ marginTop: 20, width: "100%", justifyContent: "center" }}
              onClick={() => {
                if (newBudget.limit) {
                  setBudgets(prev => [...prev, { id: generateId(), category: newBudget.category, limit: parseFloat(newBudget.limit), period: "monthly" }]);
                  setNewBudget({ category: "Groceries", limit: "" });
                  setShowAddBudget(false);
                }
              }}>
              <Plus size={16} /> Add Budget
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
