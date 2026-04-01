import { useState } from "react";

const TerminalPanel = () => {
 const [activeTab, setActiveTab] = useState("terminal");

 return (
 <div className="flex flex-col h-full flex-1 min-h-[150px]">
 <div className="flex border-b border-ide-border h-[38px] items-center px-3 gap-0.5 shrink-0">
 {["terminal", "logs"].map((tab) => (
 <button
 key={tab}
 onClick={() => setActiveTab(tab)}
 className={`px-2.5 h-[38px] flex items-center text-[11px] cursor-pointer border-b-2 ${
 activeTab === tab
 ? "text-ide-text border-b-ide-text-dim/30"
 : "text-ide-text-dim border-b-transparent hover:text-ide-text-muted"
 }`}
 >
 {tab}
 </button>
 ))}
 </div>

 {activeTab === "terminal" ? (
 <div className="flex-1 bg-[hsl(0,0%,3%)] p-3 font-mono text-[11px] leading-[1.7] overflow-y-auto text-ide-text-dim scrollbar-thin">
 <div><span className="text-ide-text-dim/40">~/ecommerce</span> <span className="text-ide-text">npm run dev</span></div>
 <div>&nbsp;</div>
 <div><span className="text-ide-green-bright">▶</span> <span className="text-ide-text-muted">vite v5.4.0</span></div>
 <div><span className="text-ide-green-bright">▶</span> Local: <span className="text-ide-indigo">http://localhost:3000</span></div>
 <div><span className="text-ide-green-bright">▶</span> ready in <span className="text-ide-text-muted">312ms</span></div>
 <div>&nbsp;</div>
 <div><span className="text-ide-text-dim/40">[FE]</span> <span className="text-ide-text-dim">escrevendo LoginForm.tsx...</span></div>
 <div><span className="text-ide-green-bright">✓</span> <span className="text-ide-text-dim">LoginForm.tsx saved</span></div>
 <div><span className="text-ide-text-dim/40">[FE]</span> <span className="text-ide-text-dim">escrevendo RegisterForm.tsx...</span></div>
 <div>&nbsp;</div>
 <div><span className="text-ide-text-dim/40">[BA]</span> <span className="text-ide-text-dim">escrevendo auth.service.ts...</span></div>
 <div><span className="text-ide-green-bright">✓</span> <span className="text-ide-text-dim">auth.service.ts saved</span></div>
 <div>&nbsp;</div>
 <div>
 <span className="text-ide-text-dim/40">~/ecommerce</span>{" "}
 <span className="text-ide-text">_</span>
 <span className="inline-block w-1.5 h-[13px] bg-ide-indigo ml-0.5 align-middle animate-blink" />
 </div>
 </div>
 ) : (
 <div className="flex-1 overflow-y-auto p-2.5 flex flex-col gap-0.5 scrollbar-thin">
 {[
 { time: "14:32:01", from: "SP", fromColor: "text-ide-indigo", to: "FE", toColor: "text-ide-green-bright", msg: "task assigned: LoginForm.tsx" },
 { time: "14:32:01", from: "SP", fromColor: "text-ide-indigo", to: "BA", toColor: "text-ide-amber-bright", msg: "task assigned: auth.service.ts" },
 { time: "14:32:05", from: "FE", fromColor: "text-ide-green-bright", to: "", toColor: "", msg: "começando LoginForm...", ok: true },
 { time: "14:32:08", from: "BA", fromColor: "text-ide-amber-bright", to: "", toColor: "", msg: "configurando JWT strategy", ok: false },
 { time: "14:32:12", from: "FE", fromColor: "text-ide-green-bright", to: "", toColor: "", msg: "LoginForm.tsx saved ✓", ok: true },
 ].map((log, i) => (
 <div key={i} className="text-[10px] font-mono flex gap-1.5 items-start px-1 py-0.5 rounded hover:bg-ide-surface-2">
 <span className="text-ide-text-dim/30 shrink-0">{log.time}</span>
 <span className={`font-medium shrink-0 ${log.fromColor}`}>{log.from}</span>
 {log.to && (
 <>
 <span className="text-ide-text-dim/30 shrink-0">→</span>
 <span className={`shrink-0 ${log.toColor}`}>{log.to}</span>
 </>
 )}
 <span className={`flex-1 ${log.ok ? "text-ide-green-bright" : "text-ide-text-dim"}`}>{log.msg}</span>
 </div>
 ))}
 </div>
 )}
 </div>
 );
};

export default TerminalPanel;
