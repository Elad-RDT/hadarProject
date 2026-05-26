// src/App.jsx
import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db } from './firebase';
import { WORDS_DATA, UNITS_DATA } from './words';

// פונקציית עזר לקבלת תאריך נוכחי בפורמט YYYY-MM-DD בצורה נקייה
const getTodayString = () => new Date().toISOString().split('T')[0];

function App() {
  const [user, setUser] = useState(() => localStorage.getItem('hadar_user') || null);
  const [userPhone, setUserPhone] = useState(() => localStorage.getItem('hadar_phone') || null);
  const [page, setPage] = useState('auth'); // auth, dashboard, practice, exam
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

  // טעינת הנתונים בכל פעם שהמשתמש מחובר
  useEffect(() => {
    if (user && userPhone) {
      fetchDashboard(userPhone);
    }
  }, [user, userPhone]);

  // לוגיקת התחברות והרשמה מול Firestore
  const handleAuth = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!phone || !password || (!isLogin && !firstName)) {
      setError('אנא מלא את כל השדות');
      return;
    }

    try {
      const userRef = doc(db, "users", phone.trim());
      const userSnap = await getDoc(userRef);

      if (isLogin) {
        // --- התחברות ---
        if (!userSnap.exists()) {
          setError('מספר פלאפון זה אינו רשום במערכת');
          return;
        }
        const userData = userSnap.data();
        if (userData.password !== password) {
          setError('סיסמה שגויה, נסה שוב!');
          return;
        }
        
        // התחברות מוצלחת
        localStorage.setItem('hadar_user', userData.first_name);
        localStorage.setItem('hadar_phone', phone.trim());
        setUser(userData.first_name);
        setUserPhone(phone.trim());
      } else {
        // --- הרשמה מהירה ---
        if (userSnap.exists()) {
          setError('מספר הטלפון כבר רשום במערכת');
          return;
        }

        const newUserData = {
          first_name: firstName.trim(),
          phone_number: phone.trim(),
          password: password, // בפרויקט אישי ומסך נעול של Firestore Test Mode זה בטוח ומספיק לחלוטין
          streak: 0,
          last_practice_date: null,
          progress: {} // מפת ההתקדמות של המילים: { "1_1": "V", "1_2": "X" }
        };

        await setDoc(userRef, newUserData);
        alert("ההרשמה הצליחה! עכשיו אפשר להתחבר.");
        setIsLogin(true);
      }
    } catch (err) {
      alert("שגיאה שקרתה בפיירבייס: " + err.message);
    }
  };

  // שליפת נתוני לוח הבקרה וחישוב אחוזים
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

      // חישוב התקדמות עבור כל יחידה בזמן אמת מתוך הנתונים המקומיים
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

  // התחלת תרגול כרטיסיות
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

  // עדכון סטטוס מילה (וי או איקס) וניהול ימי רצף (Streak)
  const handleWordStatus = async (wordId, status) => {
    try {
      const userRef = doc(db, "users", userPhone);
      const userSnap = await getDoc(userRef);
      const userData = userSnap.data();
      
      const currentProgress = userData.progress || {};
      currentProgress[wordId] = status;

      // לוגיקת Streak (ימי רצף)
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

      // שמירה ישירה ומיידית לענן
      await updateDoc(userRef, {
        progress: currentProgress,
        streak: currentStreak,
        last_practice_date: lastDate
      });

      // עדכון הסטייט המקומי כדי שהמסך ישתנה מיד בלי להמתין
      setWords(words.map(w => w.id === wordId ? { ...w, status } : w));
      if (dashboardData) {
        setDashboardData({
          ...dashboardData,
          streak: currentStreak,
          rawProgress: currentProgress
        });
      }

      if (page === 'practice') {
        if (currentIndex < getFilteredWords().length - 1) {
          setIsFlipped(false);
          setTimeout(() => setCurrentIndex(currentIndex + 1), 200);
        } else {
          alert("🔥 כל הכבוד! סיימת את המילים בסינון זה!");
          fetchDashboard(userPhone);
        }
      }
    } catch (err) {
      alert("שגיאה בעדכון המילה: " + err.message);
    }
  };

  const getFilteredWords = () => filterMode === 'only_X' ? words.filter(w => w.status === 'X') : words;

  const speakWord = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const cleanText = text.split('-')[0].trim(); // משמיע רק את המילה באנגלית
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = 'en-US';
      window.speechSynthesis.speak(utterance);
    }
  };

  // התחלת מבחן
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
    <div className="min-h-screen bg-[#fafafa] text-foreground font-heebo" dir="rtl">
      
      {/* NAVBAR */}
      {page !== 'auth' && (
        <nav className="bg-white shadow-sm border-b border-border py-4 px-8 flex justify-between items-center sticky top-0 z-50">
          <h1 className="text-2xl font-black text-primary flex items-center gap-2 cursor-pointer" onClick={() => fetchDashboard(userPhone)}>
            HadarCabulary <img src="/bj.png" alt="Hadar" className="inline-block w-15 h-15 mr-0 align-middle" />
          </h1>
          {user && (
            <div className="flex items-center gap-6">
              <button onClick={() => fetchDashboard(userPhone)} className={`font-bold px-4 py-2 rounded-xl transition-all flex items-center gap-2 ${page === 'dashboard' ? 'bg-primary text-white' : 'text-slate-500 hover:bg-slate-100'}`}>
                לוח בקרה <span className="text-lg">🎛️</span>
              </button>
              <button onClick={() => { setUser(null); setUserPhone(null); localStorage.clear(); setPage('auth'); }} className="text-slate-400 hover:text-destructive flex items-center gap-2 text-sm font-bold">
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
            <h2 className="text-4xl font-extrabold text-slate-900 mb-3">
              <img src="/hadarFace.jpeg" alt="Hadar" className="inline-block w-30 h-30 mr-0 align-middle rounded-full" /> HadarCabulary
            </h2>
            <p className="text-muted-foreground mb-8">אחלה דוד</p>
            
            <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8">
              <button type="button" className={`w-1/2 py-2.5 text-sm font-bold rounded-xl transition-all ${isLogin ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`} onClick={() => setIsLogin(true)}>התחברות</button>
              <button type="button" className={`w-1/2 py-2.5 text-sm font-bold rounded-xl transition-all ${!isLogin ? 'bg-white shadow-sm text-primary' : 'text-slate-500 hover:text-slate-700'}`} onClick={() => setIsLogin(false)}>הרשמה מהירה</button>
            </div>

            <form onSubmit={(e) => e.preventDefault()} className="space-y-5 text-right">
              {!isLogin && (
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">איך לקרוא לך?</label>
                  <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl focus:outline-none focus:border-primary transition-all" />
                </div>
              )}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">מספר פלאפון</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl focus:outline-none focus:border-primary transition-all text-left" dir="ltr" />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">סיסמה</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-slate-50 border border-slate-200 p-4 rounded-2xl focus:outline-none focus:border-primary transition-all text-left" dir="ltr" />
              </div>
              
              {error && <p className="text-destructive font-bold text-sm text-center bg-destructive/10 p-3 rounded-xl">{error}</p>}
              
              <button type="button" onClick={handleAuth} className="w-full bg-primary hover:bg-primary/90 text-white font-bold p-4 rounded-2xl shadow-lg shadow-primary/30 transition-all text-lg mt-4">
                {isLogin ? 'כניסה למערכת' : 'יצירת משתמש'}
              </button>
            </form>
          </div>
        )}

        {/* לוח הבקרה */}
        {page === 'dashboard' && dashboardData && (
          <div className="space-y-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div>
                <h2 className="text-4xl font-black text-slate-900 flex items-center gap-3">
                  היי {dashboardData.first_name} <img src="/hadarFace.jpeg" alt="Hadar" className="inline-block w-20 h-20 mr-0 align-middle rounded-full" />
                </h2>
                <p className="text-slate-500 text-lg mt-2">בואי נכבוש עוד מילים! 💪</p>
              </div>
              <div className="bg-gradient-to-r from-[#ff6a00] to-[#ee0979] text-white rounded-[24px] p-6 shadow-xl text-center min-w-[140px]">
                <span className="block text-5xl font-black mb-1">{dashboardData.streak}</span>
                <span className="text-sm font-bold">ימים ברצף 🔥</span>
              </div>
            </div>

            <div>
              <h3 className="text-2xl font-black text-slate-900 mb-6 border-b-2 border-slate-100 pb-2 inline-block">היחידות שלך</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {dashboardData.units.map(unit => (
                  <div key={unit.id} className="bg-white border border-slate-200 rounded-[24px] p-8 shadow-sm hover:shadow-md transition-all">
                    <h4 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-3">
                      <span>📖</span> {unit.name}
                    </h4>
                    <div className="space-y-2 mb-6">
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-bold text-slate-600 w-12">{unit.progress}%</span>
                        <div className="flex-1 bg-primary/10 rounded-full h-3">
                          <div className="bg-primary h-3 rounded-full transition-all" style={{ width: `${unit.progress}%` }}></div>
                        </div>
                      </div>
                      <div className="text-left text-xs font-bold text-slate-400">{unit.known_words} מתוך {unit.total_words} מילים</div>
                    </div>
                    <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
                      <button onClick={() => startPractice(unit.id)} className="bg-slate-50 hover:bg-primary/10 text-primary border border-primary/20 font-bold px-6 py-2.5 rounded-xl text-sm transition-all">תרגול 🃏</button>
                      <button onClick={() => startExam('30', unit.id)} className="bg-primary hover:bg-primary/90 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all shadow-md">מבחן 📝</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-[24px] p-8 shadow-sm mt-8">
              <h4 className="text-xl font-black text-slate-900 mb-6 text-center">מוכנה לבחון את עצמך? 🚀</h4>
              <div className="flex flex-col md:flex-row justify-center items-center gap-6 max-w-2xl mx-auto mb-8">
                <div className="w-full md:w-1/2">
                  <label className="block text-sm font-bold text-slate-500 mb-2">1. בחרי יחידת לימוד:</label>
                  <select value={examUnitId} onChange={(e) => setExamUnitId(e.target.value)} className="w-full border border-slate-200 bg-slate-50 p-3.5 rounded-2xl font-bold focus:outline-none">
                    {UNITS_DATA.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </select>
                </div>
                <div className="w-full md:w-1/2">
                  <label className="block text-sm font-bold text-slate-500 mb-2">2. כמות מילים למבחן:</label>
                  <select value={examCount} onChange={(e) => setExamCount(e.target.value)} className="w-full border border-slate-200 bg-slate-50 p-3.5 rounded-2xl font-bold focus:outline-none">
                    <option value="10">10 מילים</option>
                    <option value="30">30 מילים</option>
                    <option value="50">50 מילים</option>
                    <option value="all">כל מילות היחידה</option>
                  </select>
                </div>
              </div>
              <button onClick={() => startExam(examCount, examUnitId)} className="bg-primary hover:bg-primary/90 text-white font-bold px-10 py-4 rounded-2xl transition-all text-base shadow-lg mx-auto block w-full max-w-sm">התחלת מבחן ממוקד ✍️</button>
            </div>
          </div>
        )}

        {/* תרגול כרטיסיות */}
        {page === 'practice' && getFilteredWords().length > 0 && (
          <div className="max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-black text-slate-900">תרגול כרטיסיות</h2>
              <span className="text-sm font-bold text-slate-500 bg-slate-200/50 px-4 py-1.5 rounded-full">מילה {currentIndex + 1} מתוך {getFilteredWords().length}</span>
            </div>

            <div className="flex justify-center gap-4 mb-6">
              <button onClick={() => setFilterMode('all')} className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${filterMode === 'all' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-600'}`}>כל המילים</button>
              <button onClick={() => { setFilterMode('only_X'); setCurrentIndex(0); }} className={`px-4 py-1.5 text-xs font-bold rounded-full transition-all ${filterMode === 'only_X' ? 'bg-[#EF4444] text-white' : 'bg-slate-100 text-slate-600'}`}>רק מילים לתרגול (X)</button>
            </div>

            <div className="flex items-center justify-center gap-6 my-10">
              <button onClick={() => { if(currentIndex > 0) { setCurrentIndex(currentIndex - 1); setIsFlipped(false); } }} disabled={currentIndex === 0} className="w-14 h-14 bg-white border border-slate-200 rounded-full flex justify-center items-center shadow-sm disabled:opacity-30 hover:bg-slate-50 transition-all shrink-0">➡️</button>

              <div className="w-full max-w-md h-80" style={{ perspective: '1000px' }} onClick={() => setIsFlipped(!isFlipped)}>
                <div className="w-full h-full transition-transform duration-500 relative cursor-pointer" style={{ transformStyle: 'preserve-3d', transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)' }}>
                  
                  {/* קדמי */}
                  <div className="absolute inset-0 bg-gradient-to-br from-[#8E2DE2] to-[#4A00E0] rounded-[32px] shadow-2xl flex flex-col justify-center items-center p-8 text-white text-center" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}>
                    <button onClick={(e) => { e.stopPropagation(); speakWord(getFilteredWords()[currentIndex].english); }} className="absolute top-6 left-6 w-12 h-12 bg-white/20 hover:bg-white/30 rounded-full flex justify-center items-center text-xl">🔊</button>
                    <h3 className="text-4xl font-extrabold tracking-tight mb-4">{getFilteredWords()[currentIndex].english}</h3>
                    <p className="text-white/70 text-sm font-medium">לחצ/י להפוך</p>
                  </div>

                  {/* אחורי */}
                  <div className="absolute inset-0 bg-white border border-slate-200 rounded-[32px] shadow-2xl flex flex-col justify-center items-center p-8 text-center" style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                    <span className="text-primary font-black text-xs mb-3">התרגום לעברית</span>
                    <h3 className="text-4xl font-black text-slate-900 mb-6">{getFilteredWords()[currentIndex].hebrew}</h3>
                    <button onClick={(e) => { e.stopPropagation(); speakWord(getFilteredWords()[currentIndex].english); }} className="bg-slate-50 border border-slate-200 text-slate-700 px-6 py-2.5 rounded-full font-bold flex items-center gap-2 transition-all" dir="ltr">
                      <span>{getFilteredWords()[currentIndex].english}</span> 🔊
                    </button>
                  </div>
                </div>
              </div>

              <button onClick={() => { if(currentIndex < getFilteredWords().length - 1) { setCurrentIndex(currentIndex + 1); setIsFlipped(false); } }} disabled={currentIndex === getFilteredWords().length - 1} className="w-14 h-14 bg-white border border-slate-200 rounded-full flex justify-center items-center shadow-sm disabled:opacity-30 hover:bg-slate-50 transition-all shrink-0">⬅️</button>
            </div>

            <div className="flex justify-center gap-6 max-w-sm mx-auto mt-10">
              <button onClick={() => handleWordStatus(getFilteredWords()[currentIndex].id, 'X')} className="flex-1 bg-[#EF4444] hover:bg-red-600 text-white font-bold py-4 rounded-2xl shadow-lg transition-all active:scale-95">לא ידעתי... ❌</button>
              <button onClick={() => handleWordStatus(getFilteredWords()[currentIndex].id, 'V')} className="flex-1 bg-white text-[#10B981] font-bold py-4 rounded-2xl shadow-lg border-2 border-[#10B981]/30 hover:bg-emerald-50 transition-all active:scale-95">ידעתי! V 👍</button>
            </div>
          </div>
        )}

        {/* בחינה ממוקדת */}
        {page === 'exam' && examWords.length > 0 && !examFinished && (
          <div className="space-y-8 text-center max-w-2xl mx-auto">
            <h2 className="text-3xl font-black text-slate-900">בחינה ממוקדת 📝</h2>
            <div className="w-full h-80 bg-white rounded-[32px] shadow-2xl border border-slate-100 flex flex-col justify-center items-center p-8 cursor-pointer" onClick={() => setIsFlipped(!isFlipped)}>
              {!isFlipped ? (
                <>
                  <h3 className="text-5xl font-black text-slate-900 mb-6">{examWords[currentIndex].english}</h3>
                  <p className="text-slate-400 font-bold">לחצי כדי לחשוף את התשובה</p>
                </>
              ) : (
                <>
                  <span className="text-sm font-bold text-emerald-500 mb-3">התרגום הנכון:</span>
                  <h3 className="text-4xl font-black text-emerald-600">{examWords[currentIndex].hebrew}</h3>
                </>
              )}
            </div>
            {isFlipped && (
              <div className="flex justify-center gap-6 max-w-sm mx-auto">
                <button onClick={() => handleExamAnswer(true)} className="flex-1 bg-[#10B981] text-white font-bold py-4 rounded-2xl shadow-lg transition-all">צדקתי ✅</button>
                <button onClick={() => handleExamAnswer(false)} className="flex-1 bg-[#EF4444] text-white font-bold py-4 rounded-2xl shadow-lg transition-all">טעיתי ❌</button>
              </div>
            )}
          </div>
        )}

        {page === 'exam' && examFinished && (
          <div className="bg-white border border-slate-200 shadow-xl rounded-[32px] p-10 max-w-lg mx-auto text-center space-y-8">
            <h3 className="text-4xl font-black text-slate-900">סיכום המבחן 🏁</h3>
            <div className="text-7xl font-black text-primary bg-primary/10 py-8 rounded-[32px]">{getExamGrade()}%</div>
            <div className="grid grid-cols-2 gap-4 border-t border-b border-slate-100 py-6">
              <div><span className="block text-slate-400 font-bold mb-1">הצלחות</span><span className="text-3xl font-black text-emerald-500">{examAnswers.filter(a => a.correct).length}</span></div>
              <div><span className="block text-slate-400 font-bold mb-1">טעויות</span><span className="text-3xl font-black text-rose-500">{examAnswers.filter(a => !a.correct).length}</span></div>
            </div>
            <button onClick={() => fetchDashboard(userPhone)} className="w-full bg-primary hover:bg-primary/90 text-white font-bold p-4 rounded-2xl transition-all text-lg">חזרה ללוח הבקרה</button>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;