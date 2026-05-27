// src/App.jsx
import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { WORDS_DATA, UNITS_DATA } from './words';

const getTodayString = () => new Date().toISOString().split('T')[0];

function App() {
  const [user, setUser] = useState(() => localStorage.getItem('hadar_user') || null);
  const [userPhone, setUserPhone] = useState(() => localStorage.getItem('hadar_phone') || null);
  const [page, setPage] = useState('loading'); 
  const [dashboardData, setDashboardData] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  
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
  const [selectedUnitWords, setSelectedUnitWords] = useState([]); 
  const [toast, setToast] = useState(null); 
  const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        const savedPhone = localStorage.getItem('hadar_phone');
        if (savedPhone) {
        // אם היא כבר מחוברת, משוך נתונים ועבור לדשבורד
        fetchDashboard(savedPhone);
        } else {
        // אם לא, הצג את מסך ההתחברות
        setPage('auth');
        }
    }, []); // המערך הריק מונע את הריצות הכפולות שמקריסות את הטלפון

const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!phone || !password || (!isLogin && !firstName)) {
      setError('אנא מלא את כל השדות');
      return;
    }

    setIsLoading(true); // מדליקים את הטעינה כדי לשנות את הכפתור

    try {
      const userRef = doc(db, "users", phone.trim());
      const userSnap = await getDoc(userRef);

      if (isLogin) {
        if (!userSnap.exists()) {
          setError('מספר פלאפון זה אינו רשום במערכת');
          setIsLoading(false);
          return;
        }
        const userData = userSnap.data();
        if (userData.password !== password) {
          setError('סיסמה שגויה, נסה שוב!');
          setIsLoading(false);
          return;
        }
        
        localStorage.setItem('hadar_user', userData.first_name);
        localStorage.setItem('hadar_phone', phone.trim());
        setUser(userData.first_name);
        setUserPhone(phone.trim());
        
        // קריאה ישירה ומיידית למשיכת הנתונים ומעבר דף
        await fetchDashboard(phone.trim()); 
        
      } else {
        if (userSnap.exists()) {
          setError('מספר הטלפון כבר רשום במערכת');
          setIsLoading(false);
          return;
        }

        const newUserData = {
          first_name: firstName.trim(),
          phone_number: phone.trim(),
          password: password, 
          streak: 0,
          last_practice_date: null,
          progress: {} 
        };

        await setDoc(userRef, newUserData);
        alert("ההרשמה הצליחה! עכשיו אפשר להתחבר.");
        setIsLogin(true);
      }
    } catch (err) {
      alert("שגיאה שקרתה בפיירבייס: " + err.message);
    } finally {
      setIsLoading(false); // תמיד מכבים את הטעינה בסוף, גם אם הייתה שגיאה
    }
  };

  const fetchDashboard = async (phoneNum) => {
    try {
      const userRef = doc(db, "users", phoneNum);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        setPage('auth');
        return;
      }

      const userData = userSnap.data();
      const progress = userData.progress || {};

      const unitsWithProgress = UNITS_DATA.map(unit => {
        const unitWords = WORDS_DATA[unit.id] || [];
        const total_words = unitWords.length;
        
        const known_words = unitWords.filter(w => progress[w.id] === 'V').length;
        const progressPercent = total_words > 0 ? Math.round((known_words / total_words) * 100) : 0;

        return {
          id: unit.id,
          name: unit.name,
          total_words,
          known_words,
          progress: progressPercent
        };
      });

      setDashboardData({
        first_name: userData.first_name,
        streak: userData.streak || 0,
        units: unitsWithProgress,
        rawProgress: progress
      });
      setPage('dashboard');
    } catch (err) {
      alert("שגיאה בטעינת הנתונים: " + err.message);
      setPage('auth');
    }
  };

  const viewWordList = (unitId) => {
    const unitWords = WORDS_DATA[unitId] || [];
    const userProgress = dashboardData?.rawProgress || {};
    
    const mappedWords = unitWords.map(w => ({
      ...w,
      status: userProgress[w.id] || 'X'
    }));
    
    setSelectedUnitWords(mappedWords);
    setSelectedUnit(unitId);
    setPage('word_list');
  };

  const startPractice = (unitId) => {
    const unitWords = WORDS_DATA[unitId] || [];
    const userProgress = dashboardData?.rawProgress || {};

    const mappedWords = unitWords.map(w => ({
      ...w,
      status: userProgress[w.id] || 'X'
    }));

    setWords(mappedWords);
    setSelectedUnit(unitId);
    setCurrentIndex(0);
    setIsFlipped(false);
    setPage('practice');
  };

  const handleWordStatus = async (wordId, status, fromList = false) => {
    try {
      const userRef = doc(db, "users", userPhone);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();
      
      const currentProgress = userData.progress || {};
      currentProgress[wordId] = status;

      const todayStr = getTodayString();
      let currentStreak = userData.streak || 0;
      let lastDate = userData.last_practice_date;

      if (lastDate !== todayStr) {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];

        if (lastDate === yesterdayStr) {
          currentStreak += 1;
        } else {
          currentStreak = 1;
        }
        lastDate = todayStr;
      }

      await updateDoc(userRef, {
        progress: currentProgress,
        streak: currentStreak,
        last_practice_date: lastDate
      });

      setWords(words.map(w => w.id === wordId ? { ...w, status } : w));
      if (dashboardData) {
        setDashboardData({
          ...dashboardData,
          streak: currentStreak,
          rawProgress: currentProgress
        });
      }

      if (fromList) {
        setSelectedUnitWords(prev => prev.map(w => w.id === wordId ? { ...w, status } : w));
        return; 
      }

      if (status === 'V') {
        setToast({ message: "מעולה! 🎉", type: "success" });
      } else {
        setToast({ message: "נמשיך לתרגל 💪", type: "error" });
      }

      setTimeout(() => {
        setToast(null);
        if (page === 'practice') {
          if (currentIndex < getFilteredWords().length - 1) {
            setIsFlipped(false);
            setCurrentIndex(currentIndex + 1);
          } else {
            alert("🔥 סיימת את המילים בסינון זה!");
            fetchDashboard(userPhone);
          }
        }
      }, 800);

    } catch (err) {
      alert("שגיאה בעדכון המילה: " + err.message);
    }
  };

  const getFilteredWords = () => filterMode === 'only_X' ? words.filter(w => w.status === 'X') : words;

  const speakWord = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const cleanText = text.split('-')[0].trim(); 
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  const startExam = (count, unitId) => {
    const unitWords = WORDS_DATA[unitId] || [];
    if (unitWords.length === 0) {
      alert("אין מילים זמינות ביחידה זו");
      return;
    }

    let shuffled = [...unitWords];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    if (count !== 'all') {
      shuffled = shuffled.slice(0, parseInt(count));
    }
    
    setExamWords(shuffled);
    setExamAnswers([]);
    setCurrentIndex(0);
    setIsFlipped(false);
    setExamFinished(false);
    setPage('exam');
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

  const getExamGrade = () => examWords.length > 0 ? Math.round((examAnswers.filter(a => a.correct).length / examWords.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-[#f7f9fc] text-slate-800" dir="rtl">
      
      {/* NAVBAR */}
      {page !== 'auth' && (
        <nav className="bg-white shadow-sm border-b-2 border-slate-200 py-4 px-8 flex justify-between items-center sticky top-0 z-50">
          <h1 className="text-2xl title-glow flex items-center gap-2 cursor-pointer" onClick={() => fetchDashboard(userPhone)}>
            HadarCabulary 
          </h1>

          {user && (
            <div className="flex items-center gap-6">
              <button onClick={() => { setUser(null); setUserPhone(null); localStorage.clear(); setPage('auth'); }} className="text-slate-400 hover:text-rose-500 flex items-center gap-2 text-sm font-bold transition-colors">
                <span className="font-extrabold text-xl bg-gradient-to-l from-[hsl(265,84%,55%)] to-[hsl(330,80%,60%)] bg-clip-text text-transparent">התנתקות </span>
              </button>
            </div>
          )}
        </nav>
      )}

      <div className="max-w-5xl mx-auto p-4 md:p-8">
        
        {/* עמוד טעינה (מיידי) */}
        {page === 'loading' && (
          <div className="flex flex-col items-center justify-center min-h-[60vh] animate-pulse">
            <img src="/hadarFace.jpeg" alt="Loading" className="w-24 h-24 object-cover rounded-full border-4 border-purple-200 shadow-lg mb-6" />
            <h2 className="text-3xl font-black text-slate-400">טוען נתונים... ⏳</h2>
          </div>
        )}

        {/* אנימציית פידבק (TOAST) */}
        {toast && (
          <div className={`fixed top-24 left-1/2 -translate-x-1/2 z-50 px-8 py-4 rounded-2xl shadow-2xl font-black text-white text-lg animate-bounce transition-all border-b-4 ${toast.type === 'success' ? 'bg-[#58cc02] border-[#58a700]' : 'bg-[#ff4b4b] border-[#ea2b2b]'}`}>
            {toast.message}
          </div>
        )}

        {/* עמוד רשימת מילים (WORD LIST) */}
        {page === 'word_list' && (
          <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            <div className="game-card p-6 flex flex-col sm:flex-row justify-between items-center gap-4">
              <h2 className="text-2xl font-black text-slate-800">
                רשימת מילים <span className="text-purple-500">❖</span> {UNITS_DATA.find(u => u.id === selectedUnit)?.name}
              </h2>
              <button onClick={() => fetchDashboard(userPhone)} className="btn-3d-white w-full sm:w-auto">חזרה 🔙</button>
            </div>
            
            <div className="game-card overflow-hidden">
              <div className="max-h-[65vh] overflow-y-auto p-4 space-y-3 bg-slate-50/50">
                {selectedUnitWords.map((word, idx) => (
                  <div key={word.id} className="flex flex-col md:flex-row justify-between items-center p-5 bg-white rounded-[24px] border-2 border-slate-100 hover:border-purple-200 hover:shadow-md transition-all gap-4">
                    
                    {/* צד אנגלית (LTR) */}
                    <div className="flex items-center gap-4 w-full md:w-1/2" dir="ltr">
                      <span className="text-slate-300 font-black w-8 text-lg shrink-0">{idx + 1}.</span>
                      <button onClick={() => speakWord(word.english)} className="w-10 h-10 bg-slate-100 hover:bg-slate-200 rounded-full flex items-center justify-center text-lg transition-all shrink-0 active:scale-95">🔊</button>
                      <span className="font-black text-xl text-slate-800 break-words">{word.english}</span>
                    </div>

                    {/* צד עברית וסטטוס (RTL) */}
                    <div className="flex items-center justify-between md:justify-end gap-6 w-full md:w-1/2">
                      <span className="font-bold text-slate-600 text-lg text-right break-words">{word.hebrew}</span>
                      
                      <button 
                        onClick={() => handleWordStatus(word.id, word.status === 'V' ? 'X' : 'V', true)}
                        className={`w-12 h-12 shrink-0 flex items-center justify-center rounded-2xl font-black text-white text-xl transition-all active:scale-95 border-b-4 ${word.status === 'V' ? 'bg-[#58cc02] border-[#58a700] hover:bg-[#46a302]' : 'bg-slate-300 border-slate-400 hover:bg-slate-400'}`}
                        title="לחץ כדי לשנות סטטוס"
                      >
                        {word.status === 'V' ? '✓' : '✗'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {/* עמוד התחברות */}
        {page === 'auth' && (
          <div className="game-card p-10 max-w-md mx-auto mt-12 text-center animate-fade-in">
            <h2 className="text-4xl title-glow mb-2 flex flex-col items-center gap-4">
              <img src="/hadarFace.jpeg" alt="Hadar" className="w-28 h-28 object-cover rounded-full border-4 border-purple-100 shadow-md" /> 
              HadarCabulary
            </h2>
            <p className="text-slate-400 font-bold mb-8">האפליקציה שתלמד אותך אנגלית באמת 🚀</p>
            
            <div className="flex bg-slate-100 p-2 rounded-2xl mb-8 border-2 border-slate-200">
              <button type="button" className={`w-1/2 py-3 text-sm font-black rounded-xl transition-all ${isLogin ? 'bg-white shadow-sm text-purple-600 border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`} onClick={() => setIsLogin(true)}>התחברות</button>
              <button type="button" className={`w-1/2 py-3 text-sm font-black rounded-xl transition-all ${!isLogin ? 'bg-white shadow-sm text-purple-600 border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`} onClick={() => setIsLogin(false)}>הרשמה מהירה</button>
            </div>

                <form onSubmit={handleAuth} className="space-y-4 text-right">
                {!isLogin && (
                    <div>
                    <label className="block text-sm font-bold text-slate-500 mb-2 px-2">איך לקרוא לך?</label>
                    <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-200 p-4 rounded-2xl focus:outline-none focus:border-purple-400 focus:bg-white transition-all font-bold" />
                    </div>
                )}
                <div>
                    <label className="block text-sm font-bold text-slate-500 mb-2 px-2">מספר פלאפון</label>
                    <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-200 p-4 rounded-2xl focus:outline-none focus:border-purple-400 focus:bg-white transition-all text-left font-bold tracking-wider" dir="ltr" />
                </div>
                <div>
                    <label className="block text-sm font-bold text-slate-500 mb-2 px-2">סיסמה</label>
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-50 border-2 border-slate-200 p-4 rounded-2xl focus:outline-none focus:border-purple-400 focus:bg-white transition-all text-left font-bold tracking-widest" dir="ltr" />
                </div>
                
                {error && <p className="text-rose-500 font-bold text-sm text-center bg-rose-50 p-3 rounded-xl border border-rose-100">{error}</p>}
                
                <div className="pt-4">
                    <button type="submit" disabled={isLoading} className="w-full btn-3d-purple text-lg disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none">
                    {isLoading ? 'מתחבר... ⏳' : (isLogin ? 'כניסה למערכת' : 'יצירת משתמש חדש')}
                    </button>
                </div>
                </form>
          </div>
        )}

        {/* לוח הבקרה */}
        {page === 'dashboard' && dashboardData && (
          <div className="space-y-10 animate-fade-in">
            {/* Header Dashboard */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-6 game-card p-8 bg-gradient-to-l from-white to-purple-50/50">
              <div className="text-center md:text-right">
                <h2 className="text-4xl font-black text-slate-800 flex flex-col md:flex-row items-center gap-4">
                  <img src="/hadarFace.jpeg" alt="Hadar" className="w-20 h-20 object-cover rounded-full shadow-md border-4 border-white" />
                  היי {dashboardData.first_name}!
                </h2>
                <p className="text-slate-500 font-bold text-lg mt-3 flex items-center justify-center md:justify-start gap-2">
                  עכשיו יבוא לך ללמוד? 
                  <img src="/TheBest.jpeg" alt="The best" className="w-10 h-10 object-cover rounded-full" /> 
                </p>
              </div>
              <div className="bg-gradient-to-tr from-[#ff9a44] to-[#fc6076] text-white rounded-[28px] p-6 shadow-lg text-center min-w-[160px] transform hover:scale-105 transition-transform border-b-4 border-[#e05367]">
                <span className="block text-6xl font-black mb-1 drop-shadow-md">{dashboardData.streak}</span>
                <span className="text-base font-bold drop-shadow-sm">ימים ברצף 🔥</span>
              </div>
            </div>

            {/* Units Grid */}
            <div>
              <h3 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-2">
                היחידות שלך <span className="text-purple-500 text-3xl">📚</span>
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {dashboardData.units.map(unit => (
                  <div key={unit.id} className="game-card p-8 flex flex-col h-full justify-between">
                    <div>
                      <h4 className="text-xl font-black text-slate-700 mb-6 flex items-start gap-3 leading-tight">
                        <span className="text-2xl">📖</span> {unit.name}
                      </h4>
                      <div className="space-y-3 mb-8">
                        <div className="flex items-center gap-4">
                          <span className="text-base font-black text-purple-600 w-12">{unit.progress}%</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-4 border-2 border-slate-100 p-0.5">
                            <div className="bg-purple-500 h-full rounded-full transition-all duration-1000 relative overflow-hidden" style={{ width: `${unit.progress}%` }}>
                               <div className="absolute inset-0 bg-white/20 w-full h-full skew-x-12 translate-x-4"></div>
                            </div>
                          </div>
                        </div>
                        <div className="text-left text-sm font-bold text-slate-400 px-1">{unit.known_words} מתוך {unit.total_words} מילים ירוקות</div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-6 border-t-2 border-slate-50 flex-wrap">
                      <button onClick={() => viewWordList(unit.id)} className="btn-3d-white text-sm px-4">רשימה 📋</button>
                      <button onClick={() => startPractice(unit.id)} className="btn-3d-purple text-sm px-4">תרגול 🃏</button>
                      <button onClick={() => startExam('30', unit.id)} className="btn-3d-primary text-sm px-4">מבחן 📝</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Exam Setup */}
            <div className="game-card p-10 bg-gradient-to-b from-white to-blue-50/30">
              <h4 className="text-2xl font-black text-slate-800 mb-8 text-center">מוכנה לבחון את עצמך? 🚀</h4>
              <div className="flex flex-col md:flex-row justify-center items-center gap-6 max-w-2xl mx-auto mb-10">
                <div className="w-full md:w-1/2">
                  <label className="block text-sm font-bold text-slate-500 mb-3 px-2">1. בחרי יחידת לימוד:</label>
                  <select value={examUnitId} onChange={(e) => setExamUnitId(e.target.value)} className="w-full border-2 border-slate-200 bg-white text-slate-700 p-4 rounded-2xl font-black focus:outline-none focus:border-blue-400 shadow-sm cursor-pointer hover:bg-slate-50 transition-colors">
                    {UNITS_DATA.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="w-full md:w-1/2">
                  <label className="block text-sm font-bold text-slate-500 mb-3 px-2">2. כמות מילים למבחן:</label>
                  <select value={examCount} onChange={(e) => setExamCount(e.target.value)} className="w-full border-2 border-slate-200 bg-white text-slate-700 p-4 rounded-2xl font-black focus:outline-none focus:border-blue-400 shadow-sm cursor-pointer hover:bg-slate-50 transition-colors">
                    <option value="10">10 מילים</option>
                    <option value="30">30 מילים</option>
                    <option value="50">50 מילים</option>
                    <option value="all">כל מילות היחידה</option>
                  </select>
                </div>
              </div>
              <button onClick={() => startExam(examCount, examUnitId)} className="btn-3d-purple mx-auto w-full max-w-sm text-lg py-4">התחלת מבחן ממוקד ✍️</button>
            </div>
          </div>
        )}

        {/* תרגול כרטיסיות */}
        {page === 'practice' && getFilteredWords().length > 0 && (
          <div className="max-w-2xl mx-auto animate-fade-in">
            <div className="flex justify-between items-center mb-6 px-2">
              <h2 className="text-3xl font-black text-slate-800">תרגול כרטיסיות</h2>
              <span className="text-sm font-black text-purple-600 bg-purple-100 border-2 border-purple-200 px-4 py-2 rounded-2xl">מילה {currentIndex + 1} מתוך {getFilteredWords().length}</span>
            </div>

            <div className="flex justify-center gap-3 mb-10">
              <button onClick={() => setFilterMode('all')} className={`px-5 py-2 text-sm font-black rounded-2xl transition-all border-b-4 ${filterMode === 'all' ? 'bg-purple-500 text-white border-purple-700' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>כל המילים</button>
              <button onClick={() => { setFilterMode('only_X'); setCurrentIndex(0); }} className={`px-5 py-2 text-sm font-black rounded-2xl transition-all border-b-4 ${filterMode === 'only_X' ? 'bg-[#ff4b4b] text-white border-[#ea2b2b]' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>רק מילים לתרגול (X)</button>
            </div>

            <div className="flex items-center justify-center gap-4 md:gap-8 my-10">
              <button onClick={() => { if(currentIndex > 0) { setCurrentIndex(currentIndex - 1); setIsFlipped(false); } }} disabled={currentIndex === 0} className="w-16 h-16 bg-white border-2 border-slate-200 border-b-4 rounded-2xl flex justify-center items-center shadow-sm disabled:opacity-40 disabled:border-b-2 disabled:translate-y-1 active:border-b-2 active:translate-y-1 hover:bg-slate-50 transition-all shrink-0 text-2xl">➡️</button>

              <div className="w-full max-w-sm h-96 cursor-pointer" style={{ perspective: '1000px' }} onClick={() => setIsFlipped(!isFlipped)}>
                <div className="w-full h-full transition-transform duration-500 relative" style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                  
                  {/* קדמי */}
                  <div className="absolute inset-0 bg-gradient-to-br from-[#7e22ce] to-[#3b82f6] rounded-[40px] shadow-[0_10px_40px_rgb(59,130,246,0.3)] flex flex-col justify-center items-center p-4 sm:p-8 text-white text-center border-4 border-white/20" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
                    <button onClick={(e) => { e.stopPropagation(); speakWord(getFilteredWords()[currentIndex].english); }} className="absolute top-4 left-4 sm:top-6 sm:left-6 w-12 h-12 sm:w-14 sm:h-14 bg-white/20 hover:bg-white/40 rounded-2xl flex justify-center items-center text-xl sm:text-2xl transition-colors active:scale-90 z-10">🔊</button>
                    <h3 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight mb-4 drop-shadow-lg w-full px-2 break-words mt-8">{getFilteredWords()[currentIndex].english}</h3>
                    <p className="text-white/60 font-bold uppercase tracking-widest text-xs sm:text-sm mt-auto bg-white/10 px-4 py-2 rounded-full">לחצי להפוך</p>
                  </div>

                  {/* אחורי */}
                  <div className="game-card absolute inset-0 flex flex-col justify-center items-center p-4 sm:p-8 text-center" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                    <span className="text-purple-500 font-black tracking-widest text-xs uppercase mb-4 bg-purple-50 px-3 py-1 rounded-full mt-4">התרגום לעברית</span>
                    <h3 className="text-2xl sm:text-3xl md:text-4xl font-black text-slate-800 mb-6 leading-tight w-full px-2 break-words">{getFilteredWords()[currentIndex].hebrew}</h3>
                    <button onClick={(e) => { e.stopPropagation(); speakWord(getFilteredWords()[currentIndex].english); }} className="btn-3d-white text-sm sm:text-lg w-full max-w-[200px]" dir="ltr">
                      <span className="truncate max-w-full">{getFilteredWords()[currentIndex].english}</span> 🔊
                    </button>
                  </div>
                </div>
              </div>

              <button onClick={() => { if(currentIndex < getFilteredWords().length - 1) { setCurrentIndex(currentIndex + 1); setIsFlipped(false); } }} disabled={currentIndex === getFilteredWords().length - 1} className="w-16 h-16 bg-white border-2 border-slate-200 border-b-4 rounded-2xl flex justify-center items-center shadow-sm disabled:opacity-40 disabled:border-b-2 disabled:translate-y-1 active:border-b-2 active:translate-y-1 hover:bg-slate-50 transition-all shrink-0 text-2xl">⬅️</button>
            </div>

            <div className="flex justify-center gap-6 max-w-sm mx-auto mt-12">
              <button onClick={() => handleWordStatus(getFilteredWords()[currentIndex].id, 'X')} className="flex-1 btn-3d-danger text-xl py-4">לא ידעתי ✗</button>
              <button onClick={() => handleWordStatus(getFilteredWords()[currentIndex].id, 'V')} className="flex-1 btn-3d-primary text-xl py-4">ידעתי! ✓</button>
            </div>
          </div>
        )}

        {/* בחינה ממוקדת */}
        {page === 'exam' && examWords.length > 0 && !examFinished && (
          <div className="space-y-10 text-center max-w-2xl mx-auto animate-fade-in">
            <div className="flex justify-between items-center px-4">
              <h2 className="text-3xl font-black text-slate-800">בחינה ממוקדת 📝</h2>
              <span className="text-sm font-black text-blue-600 bg-blue-50 border-2 border-blue-200 px-4 py-2 rounded-2xl">שאלה {currentIndex + 1} מתוך {examWords.length}</span>
            </div>

              <div className="game-card h-80 flex flex-col justify-center items-center p-4 sm:p-8 cursor-pointer group text-center" onClick={() => setIsFlipped(!isFlipped)}>
              {!isFlipped ? (
                <>
                  <h3 className="text-4xl sm:text-5xl md:text-6xl font-black text-slate-800 mb-8 break-words w-full px-2">{examWords[currentIndex].english}</h3>
                  <p className="text-slate-400 font-black bg-slate-50 px-4 sm:px-6 py-2 sm:py-3 rounded-2xl group-hover:bg-slate-100 transition-colors text-sm sm:text-base mt-auto">לחצי כדי לחשוף את התשובה 👀</p>
                </>
              ) : (
                <>
                  <span className="text-xs sm:text-sm font-black text-[#58cc02] mb-4 bg-[#58cc02]/10 px-4 py-1.5 rounded-full uppercase tracking-wider">התרגום הנכון</span>
                  <h3 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-800 break-words w-full px-2">{examWords[currentIndex].hebrew}</h3>
                </>
              )}
            </div>

            {isFlipped && (
              <div className="flex justify-center gap-6 max-w-sm mx-auto">
                <button onClick={() => handleExamAnswer(true)} className="flex-1 btn-3d-primary text-xl py-4">צדקתי ✓</button>
                <button onClick={() => handleExamAnswer(false)} className="flex-1 btn-3d-danger text-xl py-4">טעיתי ✗</button>
              </div>
            )}
          </div>
        )}

        {page === 'exam' && examFinished && (
          <div className="game-card p-12 max-w-lg mx-auto text-center space-y-10 animate-fade-in">
            <h3 className="text-4xl font-black text-slate-800">סיכום המבחן 🏁</h3>
            
            <div className="relative">
              <svg className="w-48 h-48 mx-auto transform -rotate-90">
                <circle cx="96" cy="96" r="88" stroke="#f1f5f9" strokeWidth="16" fill="none" />
                <circle cx="96" cy="96" r="88" stroke="#58cc02" strokeWidth="16" fill="none" strokeDasharray={`${(getExamGrade() / 100) * 553} 553`} className="transition-all duration-1000 ease-out" />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-5xl font-black text-slate-800">{getExamGrade()}%</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 pt-6">
              <div className="bg-[#58cc02]/10 border-2 border-[#58cc02]/30 rounded-3xl p-6">
                <span className="block text-[#58cc02] font-black text-lg mb-2">הצלחות ✓</span>
                <span className="text-4xl font-black text-slate-800">{examAnswers.filter(a => a.correct).length}</span>
              </div>
              <div className="bg-[#ff4b4b]/10 border-2 border-[#ff4b4b]/30 rounded-3xl p-6">
                <span className="block text-[#ff4b4b] font-black text-lg mb-2">טעויות ✗</span>
                <span className="text-4xl font-black text-slate-800">{examAnswers.filter(a => !a.correct).length}</span>
              </div>
            </div>
            <button onClick={() => fetchDashboard(userPhone)} className="w-full btn-3d-purple text-xl py-4 mt-4">חזרה ללוח הבקרה</button>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;