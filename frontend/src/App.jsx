import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MessageSquare, ShieldAlert, BarChart3, Send, ShieldCheck, Zap, Sun, Moon, Globe, Lock, FileText, Mic, Search, Plus, Pencil, MoreHorizontal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'http://127.0.0.1:8000';

const checkDanger = (text) => {
  if (!text) return false;
  const dangerWords = ['prison', 'amende', 'illégal', 'sanction', 'pénale', 'risque grave', 'annulation', 'tribunal', 'condamnation', 'poursuite'];
  return dangerWords.some(word => text.toLowerCase().includes(word));
};

const App = () => {
  const [darkMode, setDarkMode] = useState(false);
  const [activeTab, setActiveTab] = useState('chat');
  
  // États Consultation (Chat)
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(true);
  const [selectedLoi, setSelectedLoi] = useState("09-08");

  // États Audit Expert
  const [auditInput, setAuditInput] = useState("");
  const [auditInstruction, setAuditInstruction] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState("");
  const [auditResult, setAuditResult] = useState(null);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const streamRef = useRef(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      root.style.colorScheme = 'dark';
    } else {
      root.classList.remove('dark');
      root.style.colorScheme = 'light';
    }
  }, [darkMode]);

  useEffect(() => {
    const supported = Boolean(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
    setSpeechSupported(supported);
  }, []);

  const toggleTheme = () => setDarkMode(!darkMode);

  const executeSend = async (textToSend) => {
    if (!textToSend.trim()) return;

    const newMessages = [...messages, { role: 'user', content: textToSend }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await axios.post(`${API_BASE}/api/chat`, {
        prompt: textToSend,
        loi: selectedLoi
      });
      setMessages([...newMessages, { role: 'assistant', content: res.data.answer, sources: res.data.sources }]);
    } catch (err) {
      console.error("Erreur Backend Chat:", err);
      setMessages([...newMessages, { role: 'assistant', content: "Erreur de connexion au serveur (Backend injoignable)." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = () => {
    executeSend(input);
    setInput("");
  };

  const startListening = () => {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder)) {
      setSpeechSupported(false);
      alert("Enregistrement vocal indisponible sur ce navigateur. Utilisez Chrome/Edge.");
      return;
    }

    if (!window.isSecureContext) {
      alert("Le micro nécessite un contexte sécurisé (https) ou localhost.");
      return;
    }

    if (isListening && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        streamRef.current = stream;
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        recorder.onstop = async () => {
          setIsListening(false);
          try {
            setIsTranscribing(true);
            const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
            if (!audioBlob.size) {
              alert("Aucun audio capturé. Réessayez.");
              return;
            }

            const formData = new FormData();
            formData.append("file", audioBlob, "recording.webm");
            const res = await axios.post(`${API_BASE}/api/transcribe`, formData, {
              headers: { "Content-Type": "multipart/form-data" },
            });
            const transcript = (res.data?.text || "").trim();
            if (!transcript) {
              alert("Aucun texte détecté dans l'audio.");
              return;
            }
            setInput((prev) => {
              const prefix = prev.trim() ? `${prev.trim()} ` : "";
              return `${prefix}${transcript}`.trim();
            });
            alert("Transcription prête. Vérifiez le texte puis cliquez sur Envoyer.");
          } catch (err) {
            console.error("Erreur transcription audio:", err);
            alert("Transcription audio indisponible. Vérifiez le backend et réessayez.");
          } finally {
            setIsTranscribing(false);
            if (streamRef.current) {
              streamRef.current.getTracks().forEach((track) => track.stop());
              streamRef.current = null;
            }
          }
        };

        recorder.onerror = () => {
          setIsListening(false);
          alert("Erreur enregistrement audio. Vérifiez votre micro.");
        };

        recorder.start();
        setIsListening(true);
      })
      .catch(() => {
        setIsListening(false);
        alert("Accès micro refusé ou indisponible. Autorisez le micro dans le navigateur.");
      });
  };

  // --- GESTION ET NETTOYAGE DU SÉLECTEUR DE FICHIER ---
  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      console.log("📁 Nouveau fichier sélectionné :", file.name);
      
      // On nettoie les états conflictuels pour débloquer l'analyse
      setAuditInput("");
      setAuditResult(null);
      setSelectedFile(file);
      // Permet de re-selectionner le meme fichier ensuite.
      e.target.value = "";
    }
  };

  useEffect(() => {
    if (!selectedFile) {
      setFilePreviewUrl("");
      return;
    }
    if (selectedFile.type?.startsWith("image/")) {
      const nextUrl = URL.createObjectURL(selectedFile);
      setFilePreviewUrl(nextUrl);
      return () => URL.revokeObjectURL(nextUrl);
    }
    setFilePreviewUrl("");
  }, [selectedFile]);

  // --- LOGIQUE UNIFIÉE D'AUDIT PRÉDICTIF ---
  const handleLaunchAudit = async () => {
    if (!auditInput.trim() && !selectedFile) {
      alert("Veuillez saisir une situation ou importer un document (PDF/image) avant de lancer l'analyse.");
      return;
    }

    setLoadingAudit(true);
    setAuditResult(null);

    try {
      let res;
      if (selectedFile) {
        console.log("🚀 Envoi du fichier FormData PDF au pipeline...");
        const formData = new FormData();
        formData.append("file", selectedFile);
        formData.append("loi", selectedLoi);
        formData.append("instruction", auditInstruction);

        res = await axios.post(`${API_BASE}/api/audit/pdf`, formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
      } else {
        console.log("📝 Envoi de la situation textuelle au pipeline...");
        res = await axios.post(`${API_BASE}/api/audit`, {
          situation: auditInput,
          loi: selectedLoi,
          instruction: auditInstruction
        });
      }

      console.log("📥 Réponse d'audit reçue :", res.data);
      let data = res.data;
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }

      setAuditResult(data);

    } catch (err) {
      console.error("❌ Erreur lors du traitement de l'audit :", err);
      alert("Le serveur n'a pas pu analyser ce document. Vérifiez le format (PDF/image) et que le backend tourne.");
    } finally {
      setLoadingAudit(false);
    }
  };

  const chatSuggestions = [
    {
      icon: <FileText size={20} className="text-[#107c41]" />,
      title: "Quelles sont les obligations de la loi 09-08 sur les données personnelles ?",
      sub: "Loi marocaine — protection des données",
      prompt: "Quelles sont les obligations principales de la loi 09-08 sur les données personnelles au Maroc ?",
    },
    {
      icon: <ShieldAlert size={20} className="text-[#d83b01]" />,
      title: "Évaluer les risques d'une fuite de données",
      sub: "Analyse de conformité",
      prompt: "Quels sont les risques juridiques et les sanctions en cas de fuite de données personnelles au Maroc ?",
    },
    {
      icon: <Lock size={20} className="text-[#0078d4]" />,
      title: "Checklist cybersécurité loi 05-20",
      sub: "Sécurité des systèmes d'information",
      prompt: "Donne-moi une checklist de conformité à la loi 05-20 sur la cybersécurité au Maroc.",
    },
  ];

  const tabLabels = { chat: 'Consultation', audit: 'Audit Expert', stats: 'Performance' };

  const dk = darkMode;

  return (
    <div className={`min-h-screen flex overflow-hidden transition-colors duration-300 ${
      dk ? 'bg-[#0d1117] text-[#c9d1d9]' : 'bg-white text-[#242424]'
    }`}>
      
      {/* --- SIDEBAR --- */}
      <aside className={`w-[260px] shrink-0 flex flex-col border-r ${
        dk ? 'bg-[#0d1117] border-[#30363d]' : 'bg-[#f5f5f5] border-[#e1dfdd]'
      }`}>
        <div className="px-4 pt-5 pb-4">
          <div className="flex items-center gap-2.5 mb-5">
            <div className={`p-1.5 rounded-lg ${dk ? 'bg-[#161b22] border border-[#30363d]' : 'bg-white shadow-sm border border-[#e1dfdd]'}`}>
              <ShieldCheck size={22} className={dk ? 'text-[#58a6ff]' : 'text-[#0f6cbd]'} />
            </div>
            <h1 className={`text-[15px] font-semibold ${dk ? 'text-[#f0f6fc]' : 'text-[#242424]'}`}>
              LegalTech AI
            </h1>
          </div>

          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
            dk ? 'bg-[#161b22] border border-[#30363d] text-[#8b949e]' : 'bg-white border border-[#e1dfdd] text-[#616161]'
          }`}>
            <Search size={16} />
            <span className="text-[13px]">Rechercher</span>
          </div>
        </div>

        <nav className="flex-1 px-2 space-y-0.5 overflow-y-auto custom-scrollbar">
          <TabButton darkMode={dk} active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<MessageSquare size={18}/>} label="Consultation" />
          <TabButton darkMode={dk} active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} icon={<ShieldAlert size={18}/>} label="Audit Expert" />
          <TabButton darkMode={dk} active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} icon={<BarChart3 size={18}/>} label="Performance" />
        </nav>

        <div className={`p-4 space-y-3 border-t ${dk ? 'border-[#30363d]' : 'border-[#e1dfdd]'}`}>
          <div className={`rounded-lg p-3 ${dk ? 'bg-[#161b22] border border-[#30363d]' : 'bg-white border border-[#e1dfdd]'}`}>
            <p className={`text-[11px] font-semibold mb-2 ${dk ? 'text-[#8b949e]' : 'text-[#616161]'}`}>Réglementation</p>
            <select 
              value={selectedLoi} 
              onChange={(e) => setSelectedLoi(e.target.value)}
              className={`w-full text-[13px] rounded-md p-2 outline-none border ${
                dk
                  ? 'bg-[#0d1117] border-[#30363d] text-[#58a6ff] focus:border-[#58a6ff]'
                  : 'bg-[#fafafa] border-[#e1dfdd] text-[#0f6cbd] focus:border-[#0f6cbd]'
              }`}
            >
              <option value="09-08">Loi 09-08 (Données)</option>
              <option value="05-20">Loi 05-20 (Cyber)</option>
              <option value="societe">Droit des Sociétés</option>
              <option value="contrat">Gestion des Contrats</option>
            </select>
          </div>

          <button 
            onClick={toggleTheme} 
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
              dk
                ? 'text-[#8b949e] hover:bg-[#161b22]'
                : 'text-[#616161] hover:bg-[#ebebeb]'
            }`}
          >
            {dk ? (
              <><Sun size={16} className="text-amber-400" /> Mode clair</>
            ) : (
              <><Moon size={16} /> Mode sombre</>
            )}
          </button>
        </div>
      </aside>

      {/* --- ZONE PRINCIPALE --- */}
      <main className={`flex-1 flex flex-col h-screen min-w-0 ${dk ? 'bg-[#0d1117]' : 'bg-white'}`}>
        <header className={`h-14 shrink-0 flex items-center px-6 justify-between border-b ${
          dk ? 'border-[#30363d] bg-[#0d1117]' : 'border-[#e1dfdd] bg-white'
        }`}>
          <h2 className={`text-[15px] font-semibold ${dk ? 'text-[#f0f6fc]' : 'text-[#242424]'}`}>
            {tabLabels[activeTab]}
          </h2>
          <div className="flex items-center gap-2">
            {activeTab === 'chat' && (
              <button
                type="button"
                onClick={() => { setMessages([]); setInput(''); }}
                className={`p-2 rounded-lg transition-colors ${
                  dk ? 'hover:bg-[#161b22] text-[#8b949e]' : 'hover:bg-[#f5f5f5] text-[#616161]'
                }`}
                title="Nouvelle conversation"
              >
                <Pencil size={18} />
              </button>
            )}
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium ${
              dk ? 'bg-[#238636]/20 text-[#3fb950] border border-[#238636]/40' : 'bg-[#dff6dd] text-[#107c10]'
            }`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current" />
              En ligne
            </div>
            <button type="button" className={`p-2 rounded-lg ${dk ? 'hover:bg-[#161b22] text-[#8b949e]' : 'hover:bg-[#f5f5f5] text-[#616161]'}`}>
              <MoreHorizontal size={18} />
            </button>
          </div>
        </header>

        <div className={`${messages.length > 0 || activeTab !== 'chat' ? 'flex-1 overflow-y-auto' : 'hidden'} custom-scrollbar ${dk ? 'bg-[#0d1117]' : ''}`}>
          <AnimatePresence mode="wait">
            {activeTab === 'chat' && messages.length > 0 && (
              <motion.div key="chat" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-3xl w-full mx-auto px-6 py-8 space-y-8">
                {messages.map((m, i) => {
                  const isDanger = m.role === 'assistant' && checkDanger(m.content);
                  return (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start items-start gap-6'}`}>
                      {m.role === 'assistant' && (
                        <RealisticLawyerAvatar isDanger={isDanger} isThinking={false} />
                      )}
                      
                      <div className={`max-w-[85%] p-5 rounded-2xl transition-all duration-300 ${
                        m.role === 'user' 
                          ? (dk ? 'bg-[#1f6feb] text-white' : 'bg-[#0f6cbd] text-white shadow-sm')
                          : `${dk ? 'bg-[#161b22] border border-[#30363d] text-[#c9d1d9]' : 'bg-[#fafafa] border border-[#e1dfdd] shadow-sm text-[#242424]'} ${isDanger ? 'border-l-4 border-l-red-500' : m.role === 'assistant' && !dk ? 'border-l-4 border-l-[#0f6cbd]' : m.role === 'assistant' && dk ? 'border-l-4 border-l-[#58a6ff]' : ''}`
                      }`}>
                        {isDanger && (
                          <div className="flex items-center gap-2 text-red-500 mb-3 animate-pulse">
                            <ShieldAlert size={18} />
                            <span className="text-[10px] font-black uppercase tracking-widest">ALERTE : RISQUE DÉTECTÉ</span>
                          </div>
                        )}
                        <p className="text-sm leading-relaxed font-medium">{m.content}</p>
                        {m.sources && (
                          <div className={`mt-5 flex gap-2 flex-wrap border-t pt-4 ${dk ? 'border-[#30363d]' : 'border-gray-500/10'}`}>
                            {m.sources.map((s, idx) => (
                              <span key={idx} className={`text-[11px] font-medium px-2.5 py-1 rounded-md ${
                                dk
                                  ? 'bg-[#0d1117] text-[#58a6ff] border border-[#30363d]'
                                  : 'bg-white text-[#0f6cbd] border border-[#e1dfdd]'
                              }`}>📄 {s.titre}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                
                {(loading || isListening) && (
                   <div className="flex items-start gap-6">
                     <RealisticLawyerAvatar isDanger={false} isThinking={true} />
                     <div className={`text-xs animate-pulse font-medium mt-10 ${dk ? 'text-[#58a6ff]' : 'text-[#0f6cbd]'}`}>
                       {isListening ? "Écoute en cours…" : "Analyse en cours…"}
                     </div>
                   </div>
                )}
              </motion.div>
            )}

            {/* --- ONGLET AUDIT EXPERT --- */}
            {activeTab === 'audit' && (
              <motion.div key="audit" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`max-w-3xl mx-auto p-8 space-y-6 ${dk ? 'bg-[#0d1117]' : ''}`}>
                <div className={`p-8 rounded-2xl border ${
                  dk ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-[#e1dfdd] shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                }`}>
                  <div className="mb-6">
                    <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-md ${
                      dk ? 'bg-[#bc8cff]/15 text-[#bc8cff] border border-[#bc8cff]/25' : 'bg-[#edebe9] text-[#616161]'
                    }`}>Audit IA Expert</span>
                    <h3 className={`text-2xl font-semibold mt-3 ${dk ? 'text-[#f0f6fc]' : 'text-[#242424]'}`}>Analyse de risque</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <textarea 
                      value={auditInput}
                      onChange={(e) => {
                        setAuditInput(e.target.value);
                        if(e.target.value.trim() !== "") setSelectedFile(null);
                      }}
                      className={`w-full rounded-xl p-4 text-sm outline-none min-h-[140px] transition-all ${
                        dk
                          ? 'bg-[#0d1117] border border-[#30363d] text-[#c9d1d9] placeholder:text-[#6e7681] focus:border-[#58a6ff]'
                          : 'bg-[#fafafa] border border-[#e1dfdd] text-[#242424] focus:border-[#0f6cbd]'
                      }`}
                      placeholder="Décrivez votre projet juridique ou situation pour évaluer la conformité..."
                      disabled={selectedFile !== null}
                    />

                    <textarea
                      value={auditInstruction}
                      onChange={(e) => setAuditInstruction(e.target.value)}
                      className={`w-full rounded-xl p-4 text-sm outline-none min-h-[90px] transition-all ${
                        dk
                          ? 'bg-[#0d1117] border border-[#30363d] text-[#c9d1d9] placeholder:text-[#6e7681] focus:border-[#58a6ff]'
                          : 'bg-[#fafafa] border border-[#e1dfdd] text-[#242424] focus:border-[#0f6cbd]'
                      }`}
                      placeholder="Consigne d'audit (optionnel) : ex. concentre-toi sur les clauses de confidentialité, responsabilités et sanctions."
                    />

                    {/* CADRE EN POINTILLÉS POUR LE DOC PDF/IMAGE */}
                    <div className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center gap-2 ${
                      dk ? 'border-[#30363d] bg-[#0d1117]' : 'border-[#e1dfdd] bg-[#fafafa]'
                    }`}>
                      <p className={`text-[10px] font-black uppercase tracking-widest ${dk ? 'text-[#8b949e]' : 'text-gray-400'}`}>OU CHARGER UN DOCUMENT (PDF / IMAGE)</p>
                      <input 
                        ref={fileInputRef}
                        type="file" 
                        accept=".pdf,image/*"
                        onChange={handleFileChange}
                        className={`text-xs cursor-pointer file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold ${
                          dk
                            ? 'text-[#8b949e] file:bg-[#21262d] file:text-[#bc8cff] hover:file:bg-[#30363d]'
                            : 'text-gray-400 file:bg-[#bc8cff]/10 file:text-[#bc8cff] hover:file:bg-[#bc8cff]/20'
                        }`}
                      />
                      <p className={`text-[11px] ${dk ? 'text-[#8b949e]' : 'text-gray-500'}`}>
                        Formats acceptes: PDF, PNG, JPG, JPEG, WEBP.
                      </p>
                      {selectedFile && (
                        <div className="flex items-center gap-3 mt-2">
                          <span className="text-xs text-green-500 font-bold animate-pulse">
                            📄 Fichier prêt : {selectedFile.name}
                          </span>
                          <button 
                            onClick={() => {
                              setSelectedFile(null);
                              setAuditInput("");
                              setAuditResult(null);
                              if (fileInputRef.current) fileInputRef.current.value = "";
                            }}
                            className="text-xs text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded-lg hover:bg-red-500/20"
                          >
                            Effacer
                          </button>
                        </div>
                      )}
                      {filePreviewUrl && (
                        <img
                          src={filePreviewUrl}
                          alt="Apercu document"
                          className={`mt-3 max-h-56 rounded-xl border object-contain ${dk ? 'border-[#30363d]' : 'border-gray-200'}`}
                        />
                      )}
                    </div>

                    <button 
                      onClick={handleLaunchAudit}
                      disabled={loadingAudit}
                      className={`w-full text-white py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-50 ${
                        dk
                          ? 'bg-[#238636] hover:bg-[#2ea043]'
                          : 'bg-[#0f6cbd] hover:bg-[#115ea3] shadow-sm'
                      }`}
                    >
                      {loadingAudit ? "Analyse RAG en cours..." : "Lancer l'Audit Prédictif"}
                    </button>
                  </div>
                </div>

                {/* ZONE DE RÉSULTATS DE L'AUDIT */}
                {auditResult && (
                  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className={`p-8 rounded-2xl border space-y-6 ${
                    dk ? 'bg-[#161b22] border-[#30363d] text-[#c9d1d9]' : 'bg-white border-[#e1dfdd] shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
                  }`}>
                    <div className={`flex items-center justify-between border-b pb-4 ${dk ? 'border-[#30363d]' : 'border-gray-500/10'}`}>
                      <h4 className={`text-xl font-bold ${dk ? 'text-[#f0f6fc]' : ''}`}>Résultat de l'analyse réglementaire</h4>
                      <div className="flex flex-col items-end">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${dk ? 'text-[#8b949e]' : 'text-gray-400'}`}>Score de Risque</span>
                        <span className={`text-3xl font-black ${auditResult.score > 50 ? 'text-red-500' : 'text-green-500'}`}>
                          {auditResult.score}/100
                        </span>
                      </div>
                    </div>

                    <div>
                      <h5 className="text-sm font-black text-red-500 uppercase tracking-wider mb-2">🚨 Risques Identifiés :</h5>
                      <ul className={`list-disc list-inside space-y-1.5 text-sm font-medium pl-2 ${dk ? 'text-[#c9d1d9]' : ''}`}>
                        {auditResult.risques?.map((risk, idx) => <li key={idx}>{risk}</li>)}
                      </ul>
                    </div>

                    <div>
                      <h5 className="text-sm font-black text-green-500 uppercase tracking-wider mb-2">💡 Recommandations et Conseils :</h5>
                      <ul className={`list-disc list-inside space-y-1.5 text-sm font-medium pl-2 ${dk ? 'text-[#c9d1d9]' : ''}`}>
                        {auditResult.conseils?.map((advice, idx) => <li key={idx}>{advice}</li>)}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {activeTab === 'stats' && (
              <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`max-w-4xl mx-auto p-8 grid grid-cols-1 sm:grid-cols-2 gap-5 ${dk ? 'bg-[#0d1117]' : ''}`}>
                <StatCard icon={<Globe className="text-[#58a6ff]"/>} title="Documents Indexés" value="5,000+" color="text-[#58a6ff]" desc="Textes de loi officiels" darkMode={dk} />
                <StatCard icon={<Zap className="text-yellow-500"/>} title="Latence RAG" value="0.92s" color={dk ? 'text-[#f0f6fc]' : 'text-gray-800'} desc="Vitesse de traitement" darkMode={dk} />
                <StatCard icon={<Lock className="text-[#3fb950]"/>} title="Fiabilité IA" value="94.7%" color="text-[#3fb950]" desc="Score de précision" darkMode={dk} />
                <StatCard icon={<FileText className="text-[#bc8cff]"/>} title="Sources" value="82" color="text-[#bc8cff]" desc="Articles cités" darkMode={dk} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {activeTab === 'chat' && (
          <div className={`px-6 pb-8 ${messages.length === 0 ? 'flex-1 flex flex-col justify-center pt-4' : 'shrink-0 pt-2'} ${dk ? 'bg-[#0d1117]' : 'bg-white'}`}>
            <div className="max-w-3xl mx-auto w-full">
              {messages.length === 0 && (
                <div className="text-center mb-8">
                  <h3 className={`text-[28px] sm:text-[32px] font-semibold tracking-tight mb-2 ${dk ? 'text-[#f0f6fc]' : 'text-[#242424]'}`}>
                    Bonjour, comment puis-je vous aider ?
                  </h3>
                  <p className={`text-[15px] ${dk ? 'text-[#8b949e]' : 'text-[#616161]'}`}>
                    Posez vos questions sur la réglementation marocaine.
                  </p>
                </div>
              )}
              <div className={`relative flex items-center gap-2 rounded-2xl border px-3 py-2 ${
                dk
                  ? 'bg-[#161b22] border-[#30363d] shadow-[0_2px_12px_rgba(0,0,0,0.4)]'
                  : 'bg-white border-[#e1dfdd] shadow-[0_2px_12px_rgba(0,0,0,0.08)]'
              }`}>
                <button type="button" className={`p-2 rounded-lg shrink-0 ${dk ? 'text-[#8b949e] hover:bg-[#21262d]' : 'text-[#616161] hover:bg-[#f5f5f5]'}`} title="Pièce jointe">
                  <Plus size={20} />
                </button>
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Message LegalTech AI"
                  className={`flex-1 py-3 px-1 text-[15px] bg-transparent outline-none ${
                    dk ? 'text-[#f0f6fc] placeholder:text-[#6e7681]' : 'text-[#242424] placeholder:text-[#a19f9d]'
                  }`}
                />
                <button 
                  type="button"
                  onClick={startListening}
                  disabled={!speechSupported || isTranscribing}
                  title={speechSupported ? "Dicter avec le micro" : "Micro non supporté"}
                  className={`p-2 rounded-lg shrink-0 transition-all ${
                    (!speechSupported || isTranscribing)
                      ? (dk ? 'text-[#484f58] cursor-not-allowed' : 'text-gray-300 cursor-not-allowed')
                      : isListening
                        ? 'text-red-500 bg-red-500/10 animate-pulse'
                        : dk ? 'text-[#8b949e] hover:bg-[#21262d]' : 'text-[#616161] hover:bg-[#f5f5f5]'
                  }`}
                >
                  <Mic size={20} />
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={!input.trim() && !loading}
                  className={`p-2 rounded-lg shrink-0 transition-colors ${
                    dk
                      ? 'text-[#58a6ff] hover:bg-[#21262d] disabled:opacity-40'
                      : 'text-[#0f6cbd] hover:bg-[#0f6cbd]/10 disabled:opacity-40'
                  }`}
                >
                  <Send size={20} />
                </button>
              </div>

              {messages.length === 0 && (
                <div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {chatSuggestions.map((card, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => executeSend(card.prompt)}
                      className={`text-left p-4 rounded-xl border transition-all ${
                        dk
                          ? 'bg-[#161b22] border-[#30363d] hover:border-[#58a6ff]/40 hover:bg-[#21262d]'
                          : 'bg-white border-[#e1dfdd] shadow-[0_1px_4px_rgba(0,0,0,0.04)] hover:border-[#c8c6c4]'
                      }`}
                    >
                      <div className="mb-2">{card.icon}</div>
                      <p className={`text-[13px] font-medium leading-snug line-clamp-2 ${dk ? 'text-[#c9d1d9]' : 'text-[#242424]'}`}>
                        {card.title}
                      </p>
                      <p className={`text-[11px] mt-1.5 ${dk ? 'text-[#8b949e]' : 'text-[#616161]'}`}>{card.sub}</p>
                    </button>
                  ))}
                </div>
              )}

              {isListening && (
                <p className={`mt-3 text-xs font-medium ${dk ? 'text-[#8b949e]' : 'text-[#616161]'}`}>
                  Enregistrement en cours… cliquez sur le micro pour arrêter.
                </p>
              )}
              {isTranscribing && (
                <p className={`mt-2 text-xs font-medium ${dk ? 'text-[#58a6ff]' : 'text-[#0f6cbd]'}`}>
                  Transcription en cours…
                </p>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// --- SUBS-COMPOSANTS ---
const RealisticLawyerAvatar = ({ isDanger, isThinking }) => (
  <div className="relative flex-shrink-0">
    <div className={`absolute -inset-2 rounded-full opacity-60 blur-xl transition-all duration-500 ${isDanger ? 'bg-red-600 animate-pulse' : 'bg-blue-500/30'}`}></div>
    <div className={`relative w-24 h-24 rounded-full border-4 overflow-hidden shadow-2xl transition-all duration-500 ${isDanger ? 'border-red-600 shadow-red-500/40' : 'border-[#58a6ff] shadow-blue-500/20'}`}>
      <img 
        src={isDanger ? "/avocat-inquiet.png" : "/avocat-normal.png"} 
        alt="Avocat Conseil" 
        className={`w-full h-full object-cover transition-all duration-700 ${isThinking ? 'blur-[3px] grayscale scale-110' : 'scale-100'}`} 
      />
      {isThinking && (
        <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center">
          <div className="w-full h-1 bg-white absolute top-0 animate-bounce shadow-[0_0_10px_white]" />
        </div>
      )}
    </div>
  </div>
);

const TabButton = ({ active, onClick, icon, label, darkMode }) => (
  <button 
    onClick={onClick}
    className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-colors ${
      active
        ? darkMode
          ? 'bg-[#161b22] text-[#58a6ff] border border-[#30363d]'
          : 'bg-[#ebebeb] text-[#242424]'
        : darkMode
          ? 'text-[#8b949e] hover:bg-[#161b22]'
          : 'text-[#616161] hover:bg-[#ebebeb]/80'
    }`}
  >
    {active && !darkMode && (
      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#0f6cbd] rounded-r-full" />
    )}
    {active && darkMode && (
      <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#58a6ff] rounded-r-full" />
    )}
    <span className="ml-1 opacity-90">{icon}</span>
    <span>{label}</span>
  </button>
);

const StatCard = ({ icon, title, value, color, desc, darkMode }) => (
  <div className={`p-6 rounded-2xl border transition-all ${
    darkMode ? 'bg-[#161b22] border-[#30363d]' : 'bg-white border-[#e1dfdd] shadow-[0_2px_8px_rgba(0,0,0,0.06)]'
  }`}>
    <div className="flex items-center gap-2 mb-4">
      {icon}
      <p className={`text-[11px] font-semibold uppercase tracking-wide ${darkMode ? 'text-[#8b949e]' : 'text-[#616161]'}`}>{title}</p>
    </div>
    <p className={`text-4xl font-semibold ${color} mb-1`}>{value}</p>
    <p className={`text-xs ${darkMode ? 'text-[#8b949e]' : 'text-[#616161]'}`}>{desc}</p>
  </div>
);

export default App;