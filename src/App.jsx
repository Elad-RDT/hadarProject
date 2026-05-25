import React, { useState, useEffect } from 'react';

function App() {
  const [user, setUser] = useState(() => localStorage.getItem('hadar_user') || null);
  const [page, setPage] = useState('auth'); // auth, dashboard, practice, exam, word_list
  const [dashboardData, setDashboardData] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectedUnitName, setSelectedUnitName] = useState('');
  
  const [words, setWords] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [filterMode, setFilterMode] = useState('all');
  
  const [examWords, setExamWords] = useState([]);
  const [examAnswers, setExamAnswers] = useState([]);
  const [examFinished, setExamFinished] = useState(false);
  const [examCount, setExamCount] = useState('10');
  const [examUnitId, setExamUnitId] = useState('1');

  const [isLogin, setIsLogin] = useState(true);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) fetchDashboard();
  }, [user]);

  const apiFetch = async (endpoint, options = {}) => {
    options.headers = { ...options.headers, 'Content-Type': 'application/json' };
    options.credentials = 'include';
    const baseURL = import.meta.env.DEV 
      ? 'http://localhost:5000/api' 
      : 'https://hadarcabulary-backend.onrender.com/api';

    const res = await fetch(`${baseURL}${endpoint}`, options);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'משהו השתבש');
    return data;
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (isLogin) {
        const data = await apiFetch('/login', { method: 'POST', body: JSON.stringify({ phone_number: phone, password }) });
        setUser(data.first_name);
        localStorage.setItem('hadar_user', data.first_name);
        fetchDashboard();
      } else {
        const data = await apiFetch('/register', { method: 'POST', body: JSON.stringify({ phone_number: phone, password, first_name: firstName }) });
        alert(data.message);
        setIsLogin(true);
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const fetchDashboard = async () => {
    try {
      const data = await apiFetch('/dashboard');
      setDashboardData(data);
      setPage('dashboard');
    } catch (err) {
      setPage('auth');
    }
  };

  const startPractice = async (unitId) => {
    try {
      const data = await apiFetch(`/words/${unitId}`);
      setWords(data);
      setSelectedUnit(unitId);
      setCurrentIndex(0);
      setIsFlipped(false);
      setPage('practice');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleWordStatus = async (wordId, status) => {
    try {
      const data = await apiFetch('/update-word', {
        method: 'POST',
        body: JSON.stringify({ word_id: wordId, status })
      });
      setWords(words.map(w => w.id === wordId ? { ...w, status } : w));
      if (dashboardData) setDashboardData({ ...dashboardData, streak: data.streak });

      if (page === 'practice') {
        if (currentIndex < getFilteredWords().length - 1) {
          setIsFlipped(false);
          setTimeout(() => setCurrentIndex(currentIndex + 1), 200);
        } else {
          alert("🔥 כל הכבוד! סיימת את המילים בסינון זה!");
          fetchDashboard();
        }
      }
    } catch (err) {
      alert(err.message);
    }
  };

  const getFilteredWords = () => filterMode === 'only_X' ? words.filter(w => w.status === 'X') : words;

  const speakWord = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  const startExam = async (count, unitId) => {
    try {
      const data = await apiFetch(`/words/${unitId}`);
      let shuffled = [...data];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      if (count !== 'all') shuffled = shuffled.slice(0, parseInt(count));
      setExamWords(shuffled);
      setExamAnswers([]);
      setCurrentIndex(0);
      setIsFlipped(false);
      setExamFinished(false);
      setPage('exam');
    } catch (err) {
      alert(err.message);
    }
  };

  const handleExamAnswer = (isCorrect) => {
    setExamAnswers([...examAnswers, { wordId: examWords[currentIndex].id, correct: isCorrect }]);
    if (currentIndex < examWords.length - 1) {
      setIsFlipped(false);
      setTimeout(() => setCurrentIndex(currentIndex + 1), 200);
    } else {
      setExamFinished(true);
    }
  };

  const getExamGrade = () => Math.round((examAnswers.filter(a => a.correct).length / examWords.length) * 100);

  return (
    <div className="min-h-screen bg-[#fafafa] text-foreground font-heebo" dir="rtl">
      
{/* NAVBAR - יוצג רק אם אנחנו לא בעמוד ההתחברות */}
{page !== 'auth' && (
  <nav className="bg-white shadow-sm border-b border-border py-4 px-8 flex justify-between items-center sticky top-0 z-50">
    <h1 className="text-2xl font-black text-primary flex items-center gap-2 cursor-pointer" onClick={fetchDashboard}>
      HadarCabulary <img src="/bj.png" alt="Hadar" className="inline-block w-15 h-15 mr-0 align-middle" />
    </h1>
    {user && (
      <div className="flex items-center gap-6">
        <div className="hidden md:flex gap-3">
          <button onClick={fetchDashboard} className={`font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${page === 'dashboard' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
            לוח בקרה <span className="text-lg">🎛️</span>
          </button>
        </div>
        <button onClick={() => { setUser(null); localStorage.removeItem('hadar_user'); setPage('auth'); }} className="text-slate-400 hover:text-destructive flex items-center gap-2 text-sm font-bold">
          <span className="text-xl">🚪</span> התנתקות
        </button>
      </div>
    )}
  </nav>
)}

      <div className="max-w-5xl mx-auto p-6 md:p-8">
        
        {/* עמוד התחברות */}
        {page === 'auth' && (
          <div className="bg-white border border-border shadow-xl rounded-3xl p-10 max-w-md mx-auto mt-12 text-center">
            <h2 className="text-4xl font-extrabold text-slate-900 mb-3"><img src="/hadarFace.jpeg" alt="Hadar" className="inline-block w-30 h-30 mr-0 align-middle rounded-full" /> HadarCabulary</h2>
            <p className="text-muted-foreground mb-8">אחלה דוד</p>
            
            <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8">
              <button type="button" className={`w-1/2 py-2.5 text-sm font-bold rounded-xl transition-all ${isLogin ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`} onClick={() => setIsLogin(true)}>התחברות</button>
              <button type="button" className={`w-1/2 py-2.5 text-sm font-bold rounded-xl transition-all ${!isLogin ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`} onClick={() => setIsLogin(false)}>הרשמה מהירה</button>
            </div>

            <form onSubmit={handleAuth} className="space-y-5 text-right">
              {!isLogin && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">איך לקרוא לך?</label>
                  <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all" />
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">מספר פלאפון</label>
                <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-left" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">סיסמה</label>
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all text-left" dir="ltr" />
              </div>
              
              {error && <p className="text-destructive font-bold text-sm text-center bg-destructive/10 p-3 rounded-xl">{error}</p>}
              
              <button type="submit" className="w-full bg-primary hover:bg-primary/90 text-white font-bold p-4 rounded-2xl shadow-lg shadow-primary/30 transition-all text-lg mt-4">
                {isLogin ? 'כניסה למערכת' : 'יצירת משתמש'}
              </button>
            </form>
          </div>
        )}

        {/* לוח הבקרה (DASHBOARD) המשוחזר */}
        {page === 'dashboard' && dashboardData && (
          <div className="space-y-10">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h2 className="text-4xl font-black text-slate-900 flex items-center gap-3">
                  היי {dashboardData.first_name} <img src="/hadarFace.jpeg" alt="Hadar" className="inline-block w-20 h-20 mr-0 align-middle rounded-full" />
                </h2>
                <p className="text-slate-500 text-lg mt-2">בואי נכבוש עוד מילים! 💪</p>
              </div>
              
              {/* הקובייה הכתומה המקורית מהתמונה */}
              <div className="bg-gradient-to-r from-[#ff6a00] to-[#ee0979] text-white rounded-[24px] p-6 shadow-xl shadow-orange-500/20 text-center min-w-[140px] flex flex-col items-center justify-center">
                <span className="block text-5xl font-black mb-1">{dashboardData.streak}</span>
                <span className="text-sm font-bold flex items-center justify-center gap-1">ימים ברצף 🔥</span>
              </div>
            </div>

            {/* Units Grid */}
            <div>
              <h3 className="text-2xl font-black text-slate-900 mb-6 border-b-2 border-slate-100 pb-2 inline-block">היחידות שלך</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {dashboardData.units.map(unit => (
                  <div key={unit.id} className="bg-white border border-slate-200 rounded-[24px] p-8 shadow-sm hover:shadow-md transition-all">
                    <div className="flex justify-between items-start mb-8">
                      <h4 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                        <span className="text-slate-400 text-2xl">📖</span> {unit.name}
                      </h4>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="space-y-2 mb-8">
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-slate-600 w-12">{unit.progress}%</span>
                        <div className="flex-1 bg-primary/10 rounded-full h-3">
                          <div className="bg-primary h-3 rounded-full transition-all duration-1000" style={{ width: `${unit.progress}%` }}></div>
                        </div>
                      </div>
                      <div className="text-left text-xs font-bold text-slate-400">{unit.known_words} מתוך {unit.total_words} מילים</div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
                      <button onClick={() => startPractice(unit.id)} className="bg-slate-50 hover:bg-primary/10 text-primary border border-primary/20 font-bold px-6 py-2.5 rounded-xl transition-all text-sm">תרגול 🃏</button>
                      <button onClick={() => startExam('30', unit.id)} className="bg-primary hover:bg-primary/90 text-white font-bold px-6 py-2.5 rounded-xl transition-all text-sm shadow-md shadow-primary/30">מבחן 📝</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* אזור בחינה ממוקדת בתחתית */}
            <div className="bg-white border border-slate-200 rounded-[24px] p-8 shadow-sm mt-8">
              <h4 className="text-xl font-black text-slate-900 mb-6 text-center">מוכנה לבחון את עצמך? 🚀</h4>
              <div className="flex flex-col md:flex-row justify-center items-center gap-6 max-w-2xl mx-auto mb-8">
                <div className="w-full md:w-1/2">
                  <label className="block text-sm font-bold text-slate-500 mb-2">1. בחרי יחידת לימוד:</label>
                  <select value={examUnitId} onChange={(e) => setExamUnitId(e.target.value)} className="w-full border border-slate-200 bg-slate-50 text-slate-800 p-3.5 rounded-2xl focus:outline-none focus:border-primary font-bold">
                    {dashboardData.units.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="w-full md:w-1/2">
                  <label className="block text-sm font-bold text-slate-500 mb-2">2. כמות מילים למבחן:</label>
                  <select value={examCount} onChange={(e) => setExamCount(e.target.value)} className="w-full border border-slate-200 bg-slate-50 text-slate-800 p-3.5 rounded-2xl focus:outline-none focus:border-primary font-bold">
                    <option value="10">10 מילים</option>
                    <option value="30">30 מילים</option>
                    <option value="50">50 מילים</option>
                    <option value="all">כל מילות היחידה</option>
                  </select>
                </div>
              </div>
              <button onClick={() => startExam(examCount, examUnitId)} className="bg-primary hover:bg-primary/90 text-white font-bold px-10 py-4 rounded-2xl transition-all text-base shadow-lg shadow-primary/30 mx-auto block w-full max-w-sm">התחלת מבחן ממוקד ✍️</button>
            </div>
          </div>
        )}

        {/* אזור התרגול (FLASHCARDS) המשוחזר מהתמונה */}
{/* אזור התרגול (FLASHCARDS) המשוחזר מהתמונה */}
        {page === 'practice' && getFilteredWords().length > 0 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-8">
              <h2 className="text-2xl font-black text-slate-900">תרגול כרטיסיות</h2>
              <span className="text-sm font-bold text-slate-500 bg-slate-200/50 px-4 py-1.5 rounded-full">מילה {currentIndex + 1} מתוך {getFilteredWords().length}</span>
            </div>

            <div className="flex items-center justify-center gap-6 my-10">
              {/* חץ ימינה */}
              <button onClick={() => { if(currentIndex > 0) { setCurrentIndex(currentIndex - 1); setIsFlipped(false); } }} disabled={currentIndex === 0} className="w-14 h-14 bg-white border border-slate-200 rounded-full flex justify-center items-center shadow-sm disabled:opacity-30 hover:bg-slate-50 transition-all shrink-0">
                <div className="bg-blue-500 text-white w-6 h-6 rounded flex justify-center items-center font-bold">➡️</div>
              </button>

              {/* הכרטיסייה עם תיקון קבוע לכתב המראה */}
              <div className="w-full max-w-md h-80" style={{ perspective: '1000px' }} onClick={() => setIsFlipped(!isFlipped)}>
                <div 
                  className="w-full h-full transition-transform duration-500 relative cursor-pointer" 
                  style={{ 
                    transformStyle: 'preserve-3d',
                    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)'
                  }}
                >
                  
                  {/* צד קדמי (אנגלית) - מוסתר כשהכרטיסייה הפוכה */}
                  <div 
                    className="absolute inset-0 bg-gradient-to-br from-[#8E2DE2] to-[#4A00E0] rounded-[32px] shadow-2xl flex flex-col justify-center items-center p-8 text-white text-center" 
                    style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
                  >
                    <button onClick={(e) => { e.stopPropagation(); speakWord(getFilteredWords()[currentIndex].english); }} className="absolute top-6 left-6 w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full flex justify-center items-center backdrop-blur-sm transition-all text-xl">
                      🔊
                    </button>
                    <h3 className="text-5xl font-extrabold tracking-tight mb-4 drop-shadow-md">{getFilteredWords()[currentIndex].english}</h3>
                    <p className="text-white/70 text-sm font-medium">לחצ/י להפוך</p>
                  </div>

  {/* צד אחורי (עברית) - מוצג בצורה ישרה כשהכרטיסייה הפוכה */}
                  <div 
                    className="absolute inset-0 bg-white border border-slate-200 rounded-[32px] shadow-2xl flex flex-col justify-center items-center p-8 text-center" 
                    style={{ 
                      backfaceVisibility: 'hidden', 
                      WebkitBackfaceVisibility: 'hidden',
                      transform: 'rotateY(180deg)' 
                    }}
                  >
                    <span className="text-primary font-black tracking-widest text-xs uppercase mb-3">התרגום לעברית</span>
                    
                    {/* התרגום בעברית בגדול */}
                    <h3 className="text-5xl font-black text-slate-900 mb-6" dir="rtl">{getFilteredWords()[currentIndex].hebrew}</h3>
                    
                    {/* המילה באנגלית בקטן יותר עם כפתור השמעה */}
                    <button 
                      onClick={(e) => { e.stopPropagation(); speakWord(getFilteredWords()[currentIndex].english); }} 
                      className="bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 px-6 py-3 rounded-full font-bold text-lg flex items-center gap-3 mb-6 transition-all shadow-sm"
                      dir="ltr"
                    >
                      <span>{getFilteredWords()[currentIndex].english}</span>
                      <span className="text-base opacity-70">🔊</span>
                    </button>
                    
                    {/* סטטוס המילה */}
                    <div className={`text-sm font-bold ${getFilteredWords()[currentIndex].status === 'V' ? 'text-emerald-500' : 'text-rose-500'}`}>
                      סטטוס: {getFilteredWords()[currentIndex].status === 'V' ? 'יודעת (V)' : 'צריכה תרגול (X)'}
                    </div>
                  </div>

                </div>
              </div>

              {/* חץ שמאלה */}
              <button onClick={() => { if(currentIndex < getFilteredWords().length - 1) { setCurrentIndex(currentIndex + 1); setIsFlipped(false); } }} disabled={currentIndex === getFilteredWords().length - 1} className="w-14 h-14 bg-white border border-slate-200 rounded-full flex justify-center items-center shadow-sm disabled:opacity-30 hover:bg-slate-50 transition-all shrink-0">
                <div className="bg-blue-300 text-white w-6 h-6 rounded flex justify-center items-center font-bold">⬅️</div>
              </button>
            </div>

            {/* כפתורי למטה (אדום וירוק) */}
            <div className="flex justify-center gap-6 max-w-sm mx-auto mt-10">
              <button onClick={() => handleWordStatus(getFilteredWords()[currentIndex].id, 'X')} className="flex-1 bg-[#EF4444] hover:bg-red-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-red-500/30 text-lg transition-all active:scale-95 border border-red-600">
                לא ידעתי... ❌
              </button>
              <button onClick={() => handleWordStatus(getFilteredWords()[currentIndex].id, 'V')} className="flex-1 bg-white hover:bg-emerald-50 text-[#10B981] font-bold py-4 rounded-2xl shadow-lg shadow-emerald-500/10 text-lg transition-all active:scale-95 border-2 border-[#10B981]/30">
                ידעתי! V 👍
              </button>
            </div>
          </div>
        )}

        {/* ... (שאר הקוד של המבחן הממוקד זהה ברובו ועובד מעולה) ... */}
        {page === 'exam' && examWords.length > 0 && !examFinished && (
           <div className="space-y-8 text-center max-w-2xl mx-auto">
             <h2 className="text-3xl font-black text-slate-900">בחינה ממוקדת 📝</h2>
             
             <div className="w-full h-80 bg-white rounded-[32px] shadow-2xl border border-slate-100 flex flex-col justify-center items-center p-8 cursor-pointer transition-all" onClick={() => setIsFlipped(!isFlipped)}>
               {!isFlipped ? (
                 <>
                   <h3 className="text-6xl font-black text-slate-900 mb-6">{examWords[currentIndex].english}</h3>
                   <p className="text-slate-400 font-bold">לחצי כדי לחשוף את התשובה</p>
                 </>
               ) : (
                 <>
                   <span className="text-sm font-bold text-emerald-500 uppercase mb-3">התרגום הנכון:</span>
                   <h3 className="text-5xl font-black text-emerald-600">{examWords[currentIndex].hebrew}</h3>
                 </>
               )}
             </div>

             {isFlipped && (
               <div className="flex justify-center gap-6 max-w-sm mx-auto">
                 <button onClick={() => handleExamAnswer(true)} className="flex-1 bg-[#10B981] text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-500/30 text-lg transition-all active:scale-95">צדקתי ✅</button>
                 <button onClick={() => handleExamAnswer(false)} className="flex-1 bg-[#EF4444] text-white font-bold py-4 rounded-2xl shadow-lg shadow-red-500/30 text-lg transition-all active:scale-95">טעיתי ❌</button>
               </div>
             )}
           </div>
        )}

        {page === 'exam' && examFinished && (
          <div className="bg-white border border-slate-200 shadow-xl rounded-[32px] p-10 max-w-lg mx-auto text-center space-y-8">
            <h3 className="text-4xl font-black text-slate-900">סיכום המבחן 🏁</h3>
            <div className="text-8xl font-black text-primary bg-primary/10 py-8 rounded-[32px] border border-primary/20">{getExamGrade()}%</div>
            <div className="grid grid-cols-2 gap-4 border-t border-b border-slate-100 py-6">
              <div><span className="block text-slate-400 font-bold mb-1">הצלחות</span><span className="text-3xl font-black text-emerald-500">{examAnswers.filter(a => a.correct).length}</span></div>
              <div><span className="block text-slate-400 font-bold mb-1">טעויות</span><span className="text-3xl font-black text-rose-500">{examAnswers.filter(a => !a.correct).length}</span></div>
            </div>
            <button onClick={fetchDashboard} className="w-full bg-primary hover:bg-primary/90 text-white font-bold p-4 rounded-2xl shadow-lg shadow-primary/30 transition-all text-lg">חזרה ללוח הבקרה</button>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;