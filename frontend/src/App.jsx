import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { MessageSquare, ShieldAlert, BarChart3, Send, ShieldCheck, Zap, Sun, Moon, Globe, Lock, FileText, Mic } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const API_BASE = 'http://127.0.0.1:8000';

const checkDanger = (text) => {
  if (!text) return false;
  const dangerWords = ['prison', 'amende', 'illégal', 'sanction', 'pénale', 'risque grave', 'annulation', 'tribunal', 'condamnation', 'poursuite'];
  return dangerWords.some(word => text.toLowerCase().includes(word));
};

const App = () => {
  const [darkMode, setDarkMode] = useState(true);
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
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#fbfffc] via-[#f6fcf8] to-[#eef7f1] dark:bg-[#0d1117] text-gray-800 dark:text-gray-100 flex font-sans overflow-hidden transition-colors duration-500 relative">
      
      {/* --- SIDEBAR --- */}
      <aside className="w-72 bg-white/70 dark:bg-[#161b22] border-r border-emerald-100 dark:border-gray-800 flex flex-col p-6 z-20 backdrop-blur-xl shadow-[0_6px_24px_rgba(15,23,42,0.06)]">
        <div className="flex items-center gap-3 mb-10">
          <div className="bg-gradient-to-br from-[#58a6ff] to-[#bc8cff] p-2 rounded-xl shadow-lg shadow-blue-500/20">
            <ShieldCheck size={28} className="text-white" />
          </div>
          <h1 className="text-xl font-bold tracking-tight dark:text-white">LegalTech <span className="text-[#58a6ff]">AI</span></h1>
        </div>

        <nav className="space-y-3 flex-1">
          <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<MessageSquare size={20}/>} label="Consultation" />
          <TabButton active={activeTab === 'audit'} onClick={() => setActiveTab('audit')} icon={<ShieldAlert size={20}/>} label="Audit Expert" />
          <TabButton active={activeTab === 'stats'} onClick={() => setActiveTab('stats')} icon={<BarChart3 size={20}/>} label="Performance" />
        </nav>

        <button 
          onClick={toggleTheme} 
          className="mb-6 flex items-center justify-center gap-3 p-4 rounded-2xl border border-emerald-100 dark:border-gray-700 hover:bg-emerald-50/60 dark:hover:bg-gray-800 transition-all shadow-sm group"
        >
          {darkMode ? (
            <><Sun size={18} className="text-yellow-400 group-hover:rotate-45 transition-transform" /> <span className="text-xs font-bold">Mode Clair</span></>
          ) : (
            <><Moon size={18} className="text-indigo-600 group-hover:-rotate-12 transition-transform" /> <span className="text-xs font-bold">Mode Sombre</span></>
          )}
        </button>

        <div className="p-4 bg-white/75 dark:bg-gray-900/50 rounded-2xl border border-emerald-100 dark:border-gray-800 backdrop-blur-md">
          <p className="text-[10px] text-gray-400 uppercase tracking-widest mb-3 font-bold">Réglementation</p>
          <div className="space-y-2">
            <select 
              value={selectedLoi} 
              onChange={(e) => setSelectedLoi(e.target.value)}
              className="bg-transparent border border-gray-200 dark:border-gray-700 text-sm text-[#58a6ff] rounded-lg p-2 w-full outline-none focus:border-[#58a6ff] transition-all font-semibold"
            >
              <option value="09-08">Loi 09-08 (Données)</option>
              <option value="05-20">Loi 05-20 (Cyber)</option>
              <option value="societe">Droit des Sociétés</option>
              <option value="contrat">Gestion des Contrats</option>
            </select>
          </div>
        </div>
      </aside>

      {/* --- CONTENT CENTER --- */}
      <main className="flex-1 flex flex-col relative h-screen bg-emerald-50/10 dark:bg-transparent transition-colors duration-500">
        <header className="h-20 border-b border-emerald-100 dark:border-gray-800 flex items-center px-10 justify-between backdrop-blur-md bg-white/65 dark:bg-[#0d1117]/60 z-10">
          <h2 className="text-xl font-bold tracking-tight">
            {activeTab === 'chat' && 'Assistant Juridique Intelligent'}
            {activeTab === 'audit' && 'Module d\'Audit Expert'}
            {activeTab === 'stats' && 'Analytics & Performance'}
          </h2>
          <div className="flex items-center gap-2 px-3 py-1 rounded-full border bg-emerald-50 border-emerald-200 text-emerald-700">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-[11px] font-bold uppercase tracking-wider">API Online</span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-10 z-10 custom-scrollbar">
          <AnimatePresence mode="wait">
            {activeTab === 'chat' && (
              <motion.div key="chat" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="max-w-5xl mx-auto space-y-10">
                {messages.length === 0 && (
                  <div className="text-center py-24 border border-dashed border-emerald-200 dark:border-gray-800 rounded-[3rem] bg-white/70 dark:bg-transparent backdrop-blur-sm shadow-[0_6px_20px_rgba(15,23,42,0.05)]">
                    <Zap className="mx-auto text-[#58a6ff] mb-4 opacity-40" size={48} />
                    <h3 className="text-2xl font-light">Prêt pour une analyse juridique ?</h3>
                    <p className="text-gray-500 mt-2 text-sm">Posez vos questions sur la réglementation marocaine.</p>
                  </div>
                )}
                
                {messages.map((m, i) => {
                  const isDanger = m.role === 'assistant' && checkDanger(m.content);
                  return (
                    <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start items-start gap-6'}`}>
                      {m.role === 'assistant' && (
                        <RealisticLawyerAvatar isDanger={isDanger} isThinking={false} />
                      )}
                      
                      <div className={`max-w-[75%] p-7 rounded-3xl shadow-xl transition-all duration-500 ${
                        m.role === 'user' 
                          ? 'bg-[#58a6ff] text-white border-transparent' 
                          : `${darkMode ? 'bg-[#161b22] border-gray-700' : 'bg-white/80 border-emerald-100 backdrop-blur-md'} border-l-8 ${isDanger ? 'border-l-red-600 shadow-red-500/20' : 'border-l-emerald-500 shadow-emerald-500/10'}`
                      }`}>
                        {isDanger && (
                          <div className="flex items-center gap-2 text-red-500 mb-3 animate-pulse">
                            <ShieldAlert size={18} />
                            <span className="text-[10px] font-black uppercase tracking-widest">ALERTE : RISQUE DÉTECTÉ</span>
                          </div>
                        )}
                        <p className="text-sm leading-relaxed font-medium">{m.content}</p>
                        {m.sources && (
                          <div className="mt-5 flex gap-2 flex-wrap border-t border-gray-500/10 pt-4">
                            {m.sources.map((s, idx) => (
                              <span key={idx} className="text-[10px] font-bold bg-emerald-50 dark:bg-[#0d1117] text-emerald-700 dark:text-[#58a6ff] border border-emerald-200 dark:border-[#58a6ff]/30 px-3 py-1.5 rounded-lg">📄 {s.titre}</span>
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
                     <div className="text-[#58a6ff] text-xs animate-pulse font-mono font-bold mt-10 tracking-widest uppercase">
                       {isListening ? "Le Maître vous écoute..." : "Analyse des preuves en cours..."}
                     </div>
                   </div>
                )}
              </motion.div>
            )}

            {/* --- ONGLET AUDIT EXPERT AVEC IMPORTATION --- */}
            {activeTab === 'audit' && (
              <motion.div key="audit" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="max-w-3xl mx-auto space-y-8">
                <div className="bg-white/75 dark:bg-[#161b22] backdrop-blur-md border border-emerald-100 dark:border-[#bc8cff]/30 p-10 rounded-[3rem] shadow-xl shadow-slate-200/40 transition-colors">
                  <div className="mb-8">
                    <span className="bg-[#bc8cff]/10 text-[#bc8cff] text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-[#bc8cff]/20">Audit IA Expert</span>
                    <h3 className="text-3xl font-black mt-4">Analyse de Risque</h3>
                  </div>
                  
                  <div className="space-y-4">
                    <textarea 
                      value={auditInput}
                      onChange={(e) => {
                        setAuditInput(e.target.value);
                        if(e.target.value.trim() !== "") setSelectedFile(null);
                      }}
                      className="w-full bg-white/60 dark:bg-[#0d1117] border border-emerald-100/90 dark:border-gray-800 rounded-2xl p-5 text-sm outline-none focus:border-emerald-400 dark:focus:border-[#bc8cff] min-h-[140px] transition-all dark:text-white font-medium backdrop-blur-md"
                      placeholder="Décrivez votre projet juridique ou situation pour évaluer la conformité..."
                      disabled={selectedFile !== null}
                    />

                    <textarea
                      value={auditInstruction}
                      onChange={(e) => setAuditInstruction(e.target.value)}
                      className="w-full bg-white/60 dark:bg-[#0d1117] border border-emerald-100/90 dark:border-gray-800 rounded-2xl p-4 text-sm outline-none focus:border-emerald-400 dark:focus:border-[#bc8cff] min-h-[90px] transition-all dark:text-white font-medium backdrop-blur-md"
                      placeholder="Consigne d'audit (optionnel) : ex. concentre-toi sur les clauses de confidentialité, responsabilités et sanctions."
                    />

                    {/* CADRE EN POINTILLÉS POUR LE DOC PDF/IMAGE */}
                    <div className="border-2 border-dashed border-emerald-200 dark:border-gray-800 rounded-2xl p-6 bg-white/70 dark:bg-[#0d1117]/30 flex flex-col items-center justify-center gap-2 backdrop-blur-sm">
                      <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">OU CHARGER UN DOCUMENT (PDF / IMAGE)</p>
                      <input 
                        ref={fileInputRef}
                        type="file" 
                        accept=".pdf,image/*"
                        onChange={handleFileChange}
                        className="text-xs text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-[#bc8cff]/10 file:text-[#bc8cff] hover:file:bg-[#bc8cff]/20 cursor-pointer"
                      />
                      <p className="text-[11px] text-gray-500 dark:text-gray-400">
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
                          className="mt-3 max-h-56 rounded-xl border border-gray-200 dark:border-gray-700 object-contain"
                        />
                      )}
                    </div>

                    <button 
                      onClick={handleLaunchAudit}
                      disabled={loadingAudit}
                      className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 dark:from-[#bc8cff] dark:to-[#7045af] text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-emerald-300/40 hover:opacity-90 transition-all disabled:opacity-50"
                    >
                      {loadingAudit ? "Analyse RAG en cours..." : "Lancer l'Audit Prédictif"}
                    </button>
                  </div>
                </div>

                {/* ZONE DE RÉSULTATS DE L'AUDIT */}
                {auditResult && (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-8 rounded-[2.5rem] bg-white/80 dark:bg-[#161b22] border border-emerald-100 dark:border-gray-800 shadow-xl shadow-slate-200/35 backdrop-blur-sm space-y-6">
                    <div className="flex items-center justify-between border-b border-gray-500/10 pb-4">
                      <h4 className="text-xl font-bold">Résultat de l'analyse réglementaire</h4>
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Score de Risque</span>
                        <span className={`text-3xl font-black ${auditResult.score > 50 ? 'text-red-500' : 'text-green-500'}`}>
                          {auditResult.score}/100
                        </span>
                      </div>
                    </div>

                    <div>
                      <h5 className="text-sm font-black text-red-500 uppercase tracking-wider mb-2">🚨 Risques Identifiés :</h5>
                      <ul className="list-disc list-inside space-y-1.5 text-sm font-medium pl-2">
                        {auditResult.risques?.map((risk, idx) => <li key={idx}>{risk}</li>)}
                      </ul>
                    </div>

                    <div>
                      <h5 className="text-sm font-black text-green-500 uppercase tracking-wider mb-2">💡 Recommandations et Conseils :</h5>
                      <ul className="list-disc list-inside space-y-1.5 text-sm font-medium pl-2">
                        {auditResult.conseils?.map((advice, idx) => <li key={idx}>{advice}</li>)}
                      </ul>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

            {activeTab === 'stats' && (
              <motion.div key="stats" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto grid grid-cols-2 gap-8">
                <StatCard icon={<Globe className="text-[#58a6ff]"/>} title="Documents Indexés" value="5,000+" color="text-[#58a6ff]" desc="Textes de loi officiels" darkMode={darkMode} />
                <StatCard icon={<Zap className="text-yellow-500"/>} title="Latence RAG" value="0.92s" color={darkMode ? 'text-white' : 'text-gray-800'} desc="Vitesse de traitement" darkMode={darkMode} />
                <StatCard icon={<Lock className="text-green-500"/>} title="Fiabilité IA" value="94.7%" color="text-green-500" desc="Score de précision" darkMode={darkMode} />
                <StatCard icon={<FileText className="text-[#bc8cff]"/>} title="Sources" value="82" color="text-[#bc8cff]" desc="Articles cités" darkMode={darkMode} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {activeTab === 'chat' && (
          <div className="p-10 backdrop-blur-md bg-white/30 dark:bg-transparent transition-colors">
            <div className="max-w-4xl mx-auto relative group flex gap-3">
              <div className="relative flex-1">
                <input 
                  type="text" 
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                  placeholder="Posez votre question ou utilisez le micro..."
                  className="w-full bg-white/85 dark:bg-[#161b22] border border-emerald-100 dark:border-gray-700 rounded-2xl py-5 px-8 pr-28 focus:outline-none focus:ring-4 focus:ring-emerald-400/15 dark:focus:border-[#58a6ff] transition-all shadow-xl shadow-slate-200/30 text-sm dark:text-white font-medium backdrop-blur-sm"
                />
                <button 
                  type="button"
                  onClick={startListening}
                  disabled={!speechSupported || isTranscribing}
                  title={speechSupported ? "Dicter avec le micro" : "Micro non supporté sur ce navigateur"}
                  className={`absolute right-16 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all ${
                    (!speechSupported || isTranscribing)
                      ? 'text-gray-300 cursor-not-allowed'
                      : isListening
                        ? 'text-red-500 bg-red-500/10 animate-pulse scale-110'
                        : 'text-gray-400 hover:text-[#58a6ff] hover:bg-blue-500/5'
                  }`}
                >
                  <Mic size={22} />
                </button>
                <button onClick={handleSendMessage} className="absolute right-3 top-1/2 -translate-y-1/2 p-3 bg-[#58a6ff] text-white rounded-xl shadow-lg hover:scale-105 transition-all">
                  <Send size={22} />
                </button>
              </div>
            </div>
            {isListening && (
              <p className="max-w-4xl mx-auto mt-3 text-xs text-emerald-700 dark:text-emerald-400 font-semibold">
                Enregistrement en cours... cliquez sur le micro pour arrêter.
              </p>
            )}
            {isTranscribing && (
              <p className="max-w-4xl mx-auto mt-2 text-xs text-blue-700 dark:text-blue-400 font-semibold">
                Transcription en cours...
              </p>
            )}
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

const TabButton = ({ active, onClick, icon, label }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all duration-300 ${
      active
        ? 'bg-emerald-50 dark:bg-[#58a6ff]/10 text-emerald-700 dark:text-[#58a6ff] border border-emerald-100 dark:border-[#58a6ff]/20 shadow-sm'
        : 'text-gray-500 dark:text-gray-400 hover:bg-emerald-50/40 dark:hover:bg-gray-800/40'
    }`}
  >
    {icon}
    <span className="font-black text-[10px] uppercase tracking-widest">{label}</span>
  </button>
);

const StatCard = ({ icon, title, value, color, desc, darkMode }) => (
  <div className={`p-8 rounded-[2.5rem] border transition-all duration-500 ${darkMode ? 'bg-[#161b22] border-gray-800' : 'bg-white/85 border-emerald-100 shadow-lg shadow-slate-200/40 backdrop-blur-sm'}`}>
    <div className="flex items-center gap-3 mb-6">
      {icon}
      <p className="text-[10px] text-gray-400 uppercase font-black tracking-tighter">{title}</p>
    </div>
    <p className={`text-5xl font-black ${color} mb-2 tracking-tighter`}>{value}</p>
    <p className="text-gray-500 text-xs font-medium">{desc}</p>
  </div>
);

export default App;