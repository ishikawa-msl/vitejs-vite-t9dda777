import { useState, useEffect, useRef } from 'react';

/**
 * アイコンコンポーネント (SVG版)
 */
const Icon = ({ name, size = 20, className = "" }: any) => {
  const icons: any = {
    fileText: (<><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></>),
    alert: (<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>),
    x: (<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>),
    save: (<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /></>),
    scan: (<><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /></>),
    hash: (<><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></>),
    check: <polyline points="20 6 9 17 4 12" />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      {icons[name] || null}
    </svg>
  );
};

export default function App() {
  const [formData, setFormData] = useState<any>({
    orderId: "", supplier: "", issues: [], otherNote: "", jan: "", model: "", quantity: ""
  });
  const [isScanning, setIsScanning] = useState(false);
  const [scanField, setScanField] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const scannerRef = useRef<any>(null);

  // あなたのGAS URL
  const SPREADSHEET_GAS_URL = "https://script.google.com/a/macros/mitsui-soko-lg.com/s/AKfycbxqABK9uxF_v12bwzQ5xo13MaYQzly_5C35y6TclY5M3P4p_9oH33QWreXmY3W4/exec"; 

  // スキャンライブラリ & Tailwind CSS の読み込み
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://unpkg.com/html5-qrcode";
    script.async = true;
    document.body.appendChild(script);

    const styleLink = document.createElement('script');
    styleLink.src = "https://cdn.tailwindcss.com";
    document.head.appendChild(styleLink);
  }, []);

  const updateField = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  const handleStartScan = (field: string) => {
    setScanField(field);
    setCameraError("");
    setIsScanning(true);
    
    setTimeout(() => {
      // @ts-ignore
      if (typeof Html5Qrcode === 'undefined') {
        setCameraError("ライブラリを読み込み中です。");
        return;
      }
      try {
        // @ts-ignore
        const html5QrCode = new Html5Qrcode("reader");
        scannerRef.current = html5QrCode;

        // バーコード（特にJAN）を読み取りやすくするための設定
        const config = { 
          fps: 15, // 1秒あたりの解析回数
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            // 画面サイズに合わせて最適な読取エリアを計算
            const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
            const qrboxSize = Math.floor(minEdge * 0.7);
            return {
              width: qrboxSize,
              height: Math.floor(qrboxSize * 0.5) // バーコード用に横長にする
            };
          },
          aspectRatio: 1.0 
        };

        html5QrCode.start(
          { facingMode: "environment" }, 
          config,
          (decodedText: string) => {
            if (field === "JANコード") updateField('jan', decodedText);
            else updateField('model', decodedText);
            handleStopScan();
          },
          () => {} 
        ).catch((err: any) => {
          setCameraError("カメラ起動エラー: " + err);
          console.error(err);
        });
      } catch (e) {
        setCameraError("システムエラー: " + e);
      }
    }, 500);
  };

  const handleStopScan = () => {
    if (scannerRef.current) {
      scannerRef.current.stop().then(() => {
        setIsScanning(false);
        scannerRef.current = null;
      }).catch((err: any) => {
        console.error("Stop error", err);
        setIsScanning(false);
      });
    } else {
      setIsScanning(false);
    }
  };

  const handleSave = async () => {
    if (!SPREADSHEET_GAS_URL) return alert("URLが設定されていません。");
    setIsSaving(true);
    
    const payload = {
      date: new Date().toLocaleString('ja-JP'),
      orderId: formData.orderId,
      supplier: formData.supplier,
      issues: formData.issues.join(", "),
      jan_actual: formData.jan,
      model_actual: formData.model,
      qty_actual: formData.quantity,
      note: formData.otherNote
    };

    try {
      await fetch(SPREADSHEET_GAS_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      alert("送信完了！");
      setFormData({ orderId: "", supplier: "", issues: [], otherNote: "", jan: "", model: "", quantity: "" });
    } catch (e) {
      alert("送信エラー");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleIssue = (issue: string) => {
    const issues = formData.issues.includes(issue) 
      ? formData.issues.filter((i: any) => i !== issue) 
      : [...formData.issues, issue];
    updateField('issues', issues);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-40 font-sans overflow-x-hidden">
      <header className="bg-white border-b p-4 sticky top-0 z-30 shadow-sm flex items-center gap-2">
        <div className="bg-blue-600 p-1.5 rounded-lg">
          <Icon name="fileText" size={20} className="text-white" />
        </div>
        <h1 className="text-lg font-bold">入荷問い合わせ</h1>
      </header>

      <main className="max-w-md mx-auto p-5 space-y-8 animate-in fade-in duration-500">
        <section className="space-y-4">
          <div className="bg-white rounded-3xl p-6 shadow-sm border space-y-5">
            <input type="text" value={formData.orderId} onChange={(e)=>updateField('orderId', e.target.value)} className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none" placeholder="発注ID" />
            <input type="text" value={formData.supplier} onChange={(e)=>updateField('supplier', e.target.value)} className="w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none" placeholder="仕入先名" />
          </div>
        </section>

        <section className="space-y-3">
          {['JANコード', '型番'].map(f => (
            <div key={f} className="bg-white rounded-2xl border p-4 flex justify-between items-center shadow-sm">
              <div className="flex-1 mr-4">
                <p className="text-[10px] font-bold text-slate-400 mb-1">{f}</p>
                <input type="text" value={f === 'JANコード' ? formData.jan : formData.model} onChange={(e)=>updateField(f === 'JANコード' ? 'jan' : 'model', e.target.value)} className="text-sm font-bold w-full bg-transparent outline-none" placeholder="未入力" />
              </div>
              <button onClick={() => handleStartScan(f)} className="bg-blue-600 text-white px-3 py-2 rounded-xl text-[10px] font-bold shadow-md active:scale-95 flex items-center gap-1">
                <Icon name="scan" size={12} /> スキャン
              </button>
            </div>
          ))}
          <div className="bg-blue-50 rounded-2xl border border-blue-200 p-4 flex justify-between items-center text-blue-700 shadow-sm">
             <div className="flex items-center gap-2"><Icon name="hash" size={16} /><span className="text-xs font-bold">実数量</span></div>
             <input type="number" inputMode="numeric" value={formData.quantity} onChange={(e)=>updateField('quantity', e.target.value)} className="w-20 bg-white border border-blue-300 rounded text-center font-bold py-1" />
          </div>
        </section>

        <section className="bg-white rounded-3xl p-5 border shadow-sm space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {["数量違い", "破損", "納品書なし", "その他"].map(l => (
              <button key={l} onClick={() => toggleIssue(l)} className={`p-3 rounded-2xl border text-[11px] font-bold transition-all ${formData.issues.includes(l) ? "bg-blue-600 text-white border-blue-600" : "bg-slate-50 text-slate-600 border-slate-100"}`}>{l}</button>
            ))}
          </div>
          {formData.issues.includes("その他") && (
            <textarea value={formData.otherNote} onChange={(e)=>updateField('otherNote', e.target.value)} className="w-full bg-slate-50 border rounded-2xl p-4 text-sm h-24 outline-none focus:bg-white transition-colors" placeholder="詳細入力" />
          )}
        </section>

        <div className="fixed bottom-10 left-0 right-0 p-5 bg-gradient-to-t from-slate-50 flex justify-center z-20 pointer-events-none">
          <button onClick={handleSave} disabled={isSaving} className={`bg-blue-600 max-w-md w-full py-5 rounded-2xl font-bold text-white shadow-xl pointer-events-auto active:scale-95 transition-transform ${isSaving ? 'opacity-50' : ''}`}>
            {isSaving ? "送信中..." : "保存して報告を送信"}
          </button>
        </div>
      </main>

      {/* スキャン画面 */}
      {isScanning && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4">
          <div className="absolute top-8 right-8 z-50">
             <button onClick={handleStopScan} className="bg-white/20 p-2 rounded-full text-white"><Icon name="x" size={32} /></button>
          </div>
          <div className="relative w-full max-w-sm aspect-square bg-zinc-900 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl flex items-center justify-center">
            {/* スキャンエンジン表示エリア */}
            <div id="reader" className="w-full h-full"></div>
            
            {/* 解析範囲を示すオーバーレイガイド（実際の読取エリアに合わせる） */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
               <div className="w-[70%] h-[35%] border-2 border-blue-500 shadow-[0_0_20px_rgba(59,130,246,0.6)] relative rounded-md bg-blue-500/5">
                 {/* スキャンアニメーション線 */}
                 <div className="absolute top-1/2 left-0 w-full h-0.5 bg-red-500 shadow-[0_0_10px_rgba(239,68,68,1)] animate-pulse"></div>
               </div>
            </div>
          </div>
          {cameraError && <p className="text-red-400 text-xs mt-6 text-center font-bold px-4">{cameraError}</p>}
          <p className="text-white mt-10 text-sm font-bold tracking-widest">{scanField}をスキャン中</p>
          <p className="text-white/40 text-[10px] mt-4 text-center px-6">
            ※バーコードを枠の赤い線に合わせてください<br/>
            ピントが合わない場合は少し離してみてください
          </p>
        </div>
      )}
    </div>
  );
}