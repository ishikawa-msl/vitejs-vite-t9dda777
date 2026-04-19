import { useState, useEffect, useRef } from 'react';

/**
 * アイコンコンポーネント (SVG)
 */
const Icon = ({ name, size = 20, className = "" }: any) => {
  const icons: any = {
    fileText: (<><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /></>),
    alert: (<><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>),
    x: (<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>),
    save: (<><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" /><polyline points="17 21 17 13 7 13 7 21" /></>),
    scan: (<><path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" /><path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" /></>),
    hash: (<><line x1="4" y1="9" x2="20" y2="9" /><line x1="4" y1="15" x2="20" y2="15" /><line x1="10" y1="3" x2="8" y2="21" /><line x1="16" y1="3" x2="14" y2="21" /></>),
    camera: (<><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></>),
    refresh: (<><path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" /></>),
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
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [scanField, setScanField] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const scannerRef = useRef<any>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const apiKey = ""; // 実行環境から自動提供されます
  const SPREADSHEET_GAS_URL = "https://script.google.com/a/macros/mitsui-soko-lg.com/s/AKfycbxqABK9uxF_v12bwzQ5xo13MaYQzly_5C35y6TclY5M3P4p_9oH33QWreXmY3W4/exec"; 

  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://unpkg.com/html5-qrcode";
    script.async = true;
    document.body.appendChild(script);

    const tailwind = document.createElement('script');
    tailwind.src = "https://cdn.tailwindcss.com";
    document.head.appendChild(tailwind);
  }, []);

  const updateField = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
  };

  /**
   * Gemini APIを使用した画像解析（文字読み取り）
   * 指示：指数バックオフによるリトライ実装
   */
  const analyzeImageWithGemini = async (base64Data: string) => {
    const systemPrompt = "あなたは物流倉庫の検品アシスタントです。提供された画像から、商品の『型番（モデル番号）』のみを抽出してください。余計な説明は省き、型番の文字列だけを返してください。判別できない場合は「読み取り不可」とだけ返してください。";
    const userQuery = "この画像から型番を読み取ってください。";
    
    const payload = {
      contents: [
        {
          role: "user",
          parts: [
            { text: userQuery },
            { inlineData: { mimeType: "image/png", data: base64Data } }
          ]
        }
      ],
      systemInstruction: { parts: [{ text: systemPrompt }] }
    };

    const callApi = async (retryCount = 0): Promise<string> => {
      try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        
        const result = await response.json();
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (!text) throw new Error("解析結果が空です");
        return text;
      } catch (error: any) {
        if (retryCount < 5) {
          const delay = Math.pow(2, retryCount) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
          return callApi(retryCount + 1);
        }
        throw error;
      }
    };

    return await callApi();
  };

  /**
   * 写真を撮影してAIで解析（型番用）
   */
  const captureAndAnalyze = async () => {
    if (!videoRef.current || !canvasRef.current || isAnalyzing) return;
    
    setIsAnalyzing(true);
    setCameraError("");

    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;

      // ビデオが有効なサイズを持っているか確認
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        throw new Error("カメラ映像の準備ができていません。少し待ってから再度押してください。");
      }

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error("Canvasコンテキストの取得に失敗しました");
      
      ctx.drawImage(video, 0, 0);
      
      const base64Image = canvas.toDataURL('image/png').split(',')[1];
      const detectedText = await analyzeImageWithGemini(base64Image);
      
      if (detectedText === "読み取り不可") {
        setCameraError("AIが型番を判別できませんでした。もっと近づけるか、明るい場所で撮り直してください。");
      } else {
        updateField('model', detectedText);
        handleStopScan();
      }
    } catch (e: any) {
      setCameraError(`エラー: ${e.message || "解析に失敗しました"}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleStartScan = (field: string) => {
    setScanField(field);
    setCameraError("");
    setIsScanning(true);
    
    if (field === "JANコード") {
      setTimeout(() => {
        // @ts-ignore
        if (typeof Html5Qrcode === 'undefined') {
          setCameraError("システム準備中...もう一度押してください");
          return;
        }
        try {
          // @ts-ignore
          const html5QrCode = new Html5Qrcode("reader");
          scannerRef.current = html5QrCode;

          const config = { 
            fps: 20, 
            qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
              const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
              const size = Math.floor(minEdge * 0.9);
              return { width: size, height: Math.floor(size * 0.5) }; 
            }
          };

          html5QrCode.start(
            { facingMode: "environment" }, 
            config,
            (decodedText: string) => {
              updateField('jan', decodedText);
              handleStopScan();
            },
            () => {} 
          ).catch((err: any) => setCameraError("カメラ起動エラー: " + err));
        } catch (e) {
          setCameraError("エラーが発生しました");
        }
      }, 500);
    } else {
      // 型番はAIカメラ（文字認識）
      setTimeout(async () => {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
              facingMode: "environment",
              width: { ideal: 1280 },
              height: { ideal: 720 }
            } 
          });
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            scannerRef.current = stream; 
          }
        } catch (err: any) {
          setCameraError("カメラの権限が拒否されたか、利用できません。");
        }
      }, 300);
    }
  };

  const handleStopScan = () => {
    if (scannerRef.current && typeof scannerRef.current.stop === 'function') {
      scannerRef.current.stop().then(() => {
        setIsScanning(false);
        scannerRef.current = null;
      }).catch(() => {
        setIsScanning(false);
        scannerRef.current = null;
      });
    } 
    else if (scannerRef.current instanceof MediaStream) {
      scannerRef.current.getTracks().forEach(track => track.stop());
      setIsScanning(false);
      scannerRef.current = null;
    }
    else {
      setIsScanning(false);
    }
    setCameraError("");
    setIsAnalyzing(false);
  };

  const handleSave = async () => {
    if (isSaving) return;
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
        method: 'POST', mode: 'no-cors',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      alert("送信完了！スプレッドシートをご確認ください。");
      setFormData({ orderId: "", supplier: "", issues: [], otherNote: "", jan: "", model: "", quantity: "" });
    } catch (e) {
      alert("送信エラーが発生しました。");
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
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-40 font-sans overflow-x-hidden relative">
      <header className="bg-white border-b border-slate-200 p-4 sticky top-0 z-30 shadow-sm flex items-center gap-2">
        <div className="bg-blue-600 p-1.5 rounded-lg shadow-lg">
          <Icon name="fileText" size={20} className="text-white" />
        </div>
        <h1 className="text-lg font-bold tracking-tight text-slate-800">入荷問い合わせシステム</h1>
      </header>

      <main className="max-w-md mx-auto p-5 space-y-8 animate-in fade-in duration-500">
        <section className="bg-white rounded-3xl p-6 shadow-sm border border-slate-200 space-y-5">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 tracking-wider">発注ID</label>
            <input type="text" value={formData.orderId} onChange={(e)=>updateField('orderId', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all shadow-inner" placeholder="発注IDを入力" />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-slate-500 uppercase ml-1 tracking-wider">仕入先名</label>
            <input type="text" value={formData.supplier} onChange={(e)=>updateField('supplier', e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:border-blue-500 outline-none transition-all shadow-inner" placeholder="仕入先を入力" />
          </div>
        </section>

        <section className="space-y-3">
          {['JANコード', '型番'].map(f => (
            <div key={f} className="bg-white rounded-2xl border border-slate-200 p-4 flex justify-between items-center shadow-sm hover:border-blue-200 transition-all">
              <div className="flex-1 mr-4">
                <p className="text-[10px] font-bold text-slate-400 mb-1 uppercase tracking-tighter">{f}</p>
                <input type="text" value={f === 'JANコード' ? formData.jan : formData.model} onChange={(e)=>updateField(f === 'JANコード' ? 'jan' : 'model', e.target.value)} className="text-sm font-bold w-full outline-none bg-transparent text-slate-800" placeholder={`${f}を入力`} />
              </div>
              <button onClick={() => handleStartScan(f)} className="bg-blue-600 text-white px-3 py-2 rounded-xl text-[10px] font-bold shadow-md active:scale-95 transition-all flex items-center gap-1">
                <Icon name={f === 'JANコード' ? "scan" : "camera"} size={14} /> {f === 'JANコード' ? "スキャン" : "AI読取"}
              </button>
            </div>
          ))}
          <div className="bg-blue-50/50 rounded-2xl border border-blue-200 p-4 flex justify-between items-center text-blue-700 shadow-sm">
             <div className="flex items-center gap-2 font-bold text-xs"><Icon name="hash" size={16} /> 実商品の数量</div>
             <input type="number" inputMode="numeric" value={formData.quantity} onChange={(e)=>updateField('quantity', e.target.value)} className="w-20 bg-white border border-blue-300 rounded-lg text-center font-bold py-2 text-lg shadow-inner outline-none" placeholder="0" />
          </div>
        </section>

        <section className="bg-white rounded-3xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {["数量違い", "破損", "納品書なし", "その他"].map(l => (
              <button key={l} onClick={() => toggleIssue(l)} className={`p-3 rounded-2xl border text-[11px] font-bold transition-all ${formData.issues.includes(l) ? "bg-blue-600 text-white border-blue-600 shadow-inner" : "bg-slate-50 text-slate-600 border-slate-100"}`}>{l}</button>
            ))}
          </div>
          {formData.issues.includes("その他") && (
            <textarea value={formData.otherNote} onChange={(e)=>updateField('otherNote', e.target.value)} className="w-full mt-2 bg-slate-50 border border-slate-200 rounded-2xl p-4 text-sm h-32 outline-none focus:bg-white shadow-inner resize-none transition-all text-slate-800" placeholder="不備の詳細を自由に入力してください" />
          )}
        </section>

        <div className="fixed bottom-10 left-0 right-0 p-5 bg-gradient-to-t from-slate-50 via-slate-50 to-transparent flex justify-center z-20 pointer-events-none">
          <button onClick={handleSave} disabled={isSaving} className={`bg-blue-600 max-w-md w-full py-5 rounded-2xl font-bold text-white shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 pointer-events-auto ${isSaving ? 'opacity-50' : ''}`}>
            {isSaving ? "送信中..." : <><Icon name="save" size={22} /> 保存して報告を送信</>}
          </button>
        </div>
      </main>

      {/* スキャン画面モーダル */}
      {isScanning && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="absolute top-8 right-8 z-50">
             <button onClick={handleStopScan} className="bg-white/20 p-2 rounded-full text-white hover:bg-white/40 transition-colors"><Icon name="x" size={32} /></button>
          </div>
          
          <div className="relative w-full max-w-sm aspect-square bg-zinc-900 rounded-2xl overflow-hidden border-2 border-white/20 shadow-2xl flex items-center justify-center">
            {scanField === "JANコード" ? (
              <div id="reader" className="w-full h-full"></div>
            ) : (
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover"></video>
            )}
            
            {/* 視覚ガイド */}
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
               <div className={`w-[90%] h-[60%] border-4 border-blue-500 shadow-[0_0_40px_rgba(59,130,246,0.6)] relative rounded-xl bg-blue-500/5 transition-all`}>
                 <div className="absolute top-1/2 left-0 w-full h-2 bg-red-600 shadow-[0_0_20px_rgba(220,38,38,1)] animate-pulse -translate-y-1/2"></div>
               </div>
            </div>

            {isAnalyzing && (
              <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center backdrop-blur-sm">
                <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-6"></div>
                <p className="text-white text-lg font-black tracking-widest animate-pulse">AIが文字を解析中...</p>
                <p className="text-white/60 text-xs mt-2">数秒かかります。そのままお待ちください</p>
              </div>
            )}
          </div>

          <canvas ref={canvasRef} className="hidden"></canvas>

          {cameraError && (
            <div className="mt-6 bg-red-500/20 border border-red-500/50 p-4 rounded-2xl max-w-sm mx-auto">
              <p className="text-red-400 text-xs text-center font-bold">{cameraError}</p>
            </div>
          )}
          
          <div className="mt-8 flex flex-col items-center gap-4">
            <p className="text-white text-sm font-bold tracking-widest uppercase flex items-center gap-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-ping"></span>
              {scanField}を読み取り中
            </p>

            {scanField === "型番" && !isAnalyzing && (
              <button 
                onClick={captureAndAnalyze}
                className="bg-white text-slate-900 px-10 py-5 rounded-full font-black shadow-2xl active:scale-95 transition-all flex items-center gap-3 border-4 border-blue-500/20"
              >
                <Icon name="camera" size={24} /> シャッターを切る
              </button>
            )}

            <button 
              onClick={handleStopScan}
              className="text-white/40 text-xs underline mt-4 hover:text-white transition-colors"
            >
              キャンセルして戻る
            </button>
          </div>
        </div>
      )}
    </div>
  );
}