import React, { useState, useEffect } from 'react';

function App() {
  const [user, setUser] = useState(() => localStorage.getItem('hadar_user') || null);
  const [page, setPage] = useState('auth'); // auth, dashboard, practice, exam, word_list
  const [dashboardData, setDashboardData] = useState(null);
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [selectedUnitName, setSelectedUnitName] = useState('');
  
  // נתוני תרגול, רשימה ומבחן
  const [words, setWords] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [filterMode, setFilterMode] = useState('all'); // all, only_X
  
  // נתוני מבחן
  const [examWords, setExamWords] = useState([]);
  const [examAnswers, setExamAnswers] = useState([]);
  const [examFinished, setExamFinished] = useState(false);

  // טפסים
  const [isLogin, setIsLogin] = useState(true);
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
  if (user) {
    fetchDashboard();
  }
}, []);

  const apiFetch = async (endpoint, options = {}) => {
    options.headers = { ...options.headers, 'Content-Type': 'application/json' };
    options.credentials = 'include';
    const res = await fetch(`https://hadarcabulary-backend.onrender.com/api${endpoint}`, options);
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

  const openWordList = async (unitId, unitName) => {
    try {
      const data = await apiFetch(`/words/${unitId}`);
      setWords(data);
      setSelectedUnit(unitId);
      setSelectedUnitName(unitName);
      setPage('word_list');
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
      
      // עדכון הסטטוס לוקאלית ברשימת המילים
      setWords(words.map(w => w.id === wordId ? { ...w, status } : w));
      
      if (dashboardData) {
        setDashboardData({ ...dashboardData, streak: data.streak });
      }

      // אם אנחנו במצב כרטיסיות (תרגול), נעבור אוטומטית למילה הבאה
      if (page === 'practice') {
        if (currentIndex < getFilteredWords().length - 1) {
          setIsFlipped(false);
          setTimeout(() => setCurrentIndex(currentIndex + 1), 200);
        } else {
          alert("🔥 כל הכבוד הדר! סיימת את המילים בסינון זה!");
          fetchDashboard();
        }
      }
    } catch (err) {
      alert(err.message);
    }
  };

  // פונקציית עזר לבדיקה אם המשתמש כבר נגע במילה או שהיא במצב ברירת מחדל לא מסומן
  const checkRealStatus = (word) => {
    // לצורך הפרויקט, אם המילה במצב 'X', השרת מחזיר 'X'. 
    // הוספנו לוגיקה נוחה בדשבורד להצגת "טרם סומן" אם המשתמש רוצה לדעת ממה להתחיל.
    return word.status; 
  };

  const getFilteredWords = () => {
    if (filterMode === 'only_X') {
      return words.filter(w => w.status === 'X');
    }
    return words;
  };

  const speakWord = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.rate = 0.9;
      window.speechSynthesis.speak(utterance);
    }
  };

  const startExam = async (count) => {
    try {
      const data = await apiFetch(`/words/1`);
      let shuffled = [...data];
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

  const getExamGrade = () => {
    const correctCount = examAnswers.filter(a => a.correct).length;
    return Math.round((correctCount / examWords.length) * 100);
  };

  const getMotivationalMessage = (grade) => {
    if (grade >= 95) return `👑 וואו ${user}! את פשוט מלכת אוקספורד! ציון מטורף, אין עליך בעולם!`;
    if (grade >= 80) return `💪 כל הכבוד ${user}! ציון מעולה! האנגלית שלך משתבחת מרגע לרגע!`;
    if (grade >= 60) return `👍 לא רע בכלל ${user}, אבל אני יודע שאת מסוגלת ליותר. פעם הבאה מפרקים אותם!`;
    return `🫣 נו באמת ${user}... אפילו שייקספיר בכה עכשיו. חזרה זריזה לכרטיסיות ויאללה להפציץ!`;
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 antialiased selection:bg-indigo-500 selection:text-white" dir="rtl">
      
      {/* NAVBAR */}
      <nav className="bg-white shadow-sm border-b border-slate-200 py-4 px-6 flex justify-between items-center">
  <h1 className="text-2xl font-black text-indigo-600 tracking-tight cursor-pointer" onClick={fetchDashboard}>
  <img src="/bj.png" alt="BJFC Logo" className="inline-block w-6 h-6 mr-2 align-middle" /> HadarCabulary <span className="text-xs font-normal text-slate-400">Vocabulary By R.D.T</span>
</h1>
        {user && (
          <div className="flex items-center gap-4">
            <span className="font-medium text-slate-600">שלום, <strong className="text-indigo-600">{user}</strong> <img src="/hadarFace.jpeg" alt="Hadar" className="inline-block w-6 h-6 mr-2 align-middle" /></span>
            <button onClick={() => { setUser(null); localStorage.removeItem('hadar_user'); setPage('auth'); }} className="text-sm bg-slate-100 hover:bg-red-50 hover:text-red-600 px-3 py-1.5 rounded-lg transition-all font-medium">התנתקות</button>          </div>
        )}
      </nav>

      <div className="max-w-4xl mx-auto p-6">
        
        {/* PAGE 1: LOGIN / REGISTER */}
        {page === 'auth' && (
          <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-8 max-w-md mx-auto mt-12 text-center">
            <h2 className="text-3xl font-extrabold text-slate-900 mb-2"><img src="/hadarFace.jpeg" alt="Hadar" className="inline-block w-17 h-17 mr-5 align-middle" /> HadarCabulary </h2>
            <p className="text-slate-500 mb-6 text-sm">המקום היחיד שבו שכחת מילה באנגלית גוררת שיפוטיות קלה, אבל עם המון אהבה וחיזוקים!</p>
            
            <div className="flex bg-slate-100 p-1 rounded-xl mb-6">
              <button type="button" className={`w-1/2 py-2 text-sm font-bold rounded-lg transition-all ${isLogin ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`} onClick={() => setIsLogin(true)}>התחברות</button>
              <button type="button" className={`w-1/2 py-2 text-sm font-bold rounded-lg transition-all ${!isLogin ? 'bg-white shadow text-indigo-600' : 'text-slate-500'}`} onClick={() => setIsLogin(false)}>הרשמה זריזה</button>
            </div>

            <form onSubmit={handleAuth} className="space-y-4 text-right">
              {!isLogin && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">שם פרטי</label>
                  <input type="text" required value={firstName} onChange={e => setFirstName(e.target.value)} className="w-full border border-slate-200 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-center" placeholder="איך לקרוא לך?" />
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">מספר פלאפון</label>
                <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} className="w-full border border-slate-200 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-center" placeholder="0500000000" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">סיסמה</label>
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)} className="w-full border border-slate-200 p-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-center" placeholder="••••••••" />
              </div>
              
              {error && <p className="text-red-500 font-medium text-sm text-center">{error}</p>}
              
              <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold p-3 rounded-xl shadow-lg shadow-indigo-100 transition-all mt-2">
                {isLogin ? 'קדימה, בואי נלמד!' : 'יאללה, תרשמו אותי!'}
              </button>
            </form>
          </div>
        )}

        {/* PAGE 2: DASHBOARD */}
        {page === 'dashboard' && dashboardData && (
          <div className="space-y-8">
            <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-2xl p-6 shadow-xl flex justify-between items-center">
              <div>
                <h3 className="text-2xl font-black">היי {dashboardData.first_name}, מוכנה להפציץ היום? 🎯</h3>
                <p className="text-indigo-100 text-sm mt-1">כל יום של תרגול מקרב אותך לשליטה מלאה!</p>
              </div>
              <div className="bg-white/10 backdrop-blur-md px-4 py-3 rounded-xl text-center border border-white/20">
                <span className="block text-3xl">🔥 {dashboardData.streak}</span>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-200">ימי רצף!</span>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h4 className="text-lg font-bold text-slate-900 mb-4">יחידות הלימוד שלך:</h4>
              <div className="space-y-4">
                {dashboardData.units.map(unit => (
                  <div key={unit.id} className="border border-slate-100 rounded-xl p-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 hover:border-indigo-100 transition-all bg-slate-50/50">
                    <div className="flex-1 space-y-2">
                      <span className="font-bold text-slate-800 text-base block">{unit.name}</span>
                      <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                        <div className="bg-emerald-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${unit.progress}%` }}></div>
                      </div>
                      <span className="text-xs font-medium text-slate-400 block">את יודעת {unit.known_words} מתוך {unit.total_words} מילים ({unit.progress}%)</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button onClick={() => openWordList(unit.id, unit.name)} className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 font-bold px-3 py-2 rounded-xl transition-all text-sm shadow-sm flex items-center gap-1">צפייה בכל המילים 👁️</button>
                      <button onClick={() => startPractice(unit.id)} className="bg-white hover:bg-indigo-50 text-indigo-600 border border-indigo-200 font-bold px-3 py-2 rounded-xl transition-all text-sm shadow-sm">כרטיסיות תרגול 🃏</button>
                      <button onClick={() => startExam('30')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2 rounded-xl transition-all text-sm shadow-md shadow-indigo-100">מבחן מהיר 📝</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center">
              <h4 className="text-lg font-bold text-slate-900 mb-2">מוכנה לבחון את עצמך? 🚀</h4>
              <p className="text-slate-400 text-sm mb-4">בחר כמות מילים למבחן רנדומלי ומעורבב לחלוטין:</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-xl mx-auto">
                {['10', '30', '50', 'all'].map(count => (
                  <button key={count} onClick={() => startExam(count)} className="bg-slate-100 hover:bg-indigo-600 hover:text-white text-slate-700 font-bold p-3 rounded-xl transition-all text-sm shadow-sm border border-slate-200/50">
                    {count === 'all' ? 'כל המילים' : `${count} מילים`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* PAGE 3: PRACTICE ROOM (FLASHCARDS) */}
        {page === 'practice' && getFilteredWords().length > 0 && (
          <div className="space-y-6 text-center">
            <div className="flex justify-between items-center bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
              <button onClick={fetchDashboard} className="text-sm bg-slate-100 hover:bg-slate-200 px-4 py-2 rounded-lg transition-all font-bold text-slate-700">חזרה לבית 🏠</button>
              <div className="flex items-center gap-3">
                <label className="text-xs font-bold text-slate-500">מצב תרגול:</label>
                <select value={filterMode} onChange={(e) => { setFilterMode(e.target.value); setCurrentIndex(0); setIsFlipped(false); }} className="border border-slate-200 bg-slate-50 text-sm p-1.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium">
                  <option value="all">כל מילות היחידה</option>
                  <option value="only_X">רק מילים שסימנתי כ-לא יודע (❌)</option>
                </select>
              </div>
              <span className="text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">מילה {currentIndex + 1} מתוך {getFilteredWords().length}</span>
            </div>

            <div className="flex items-center justify-between gap-4 max-w-xl mx-auto my-4">
              <button onClick={() => { if(currentIndex > 0) { setCurrentIndex(currentIndex - 1); setIsFlipped(false); } }} disabled={currentIndex === 0} className="bg-white hover:bg-indigo-50 border border-slate-200 p-3 rounded-full shadow-sm transition-all disabled:opacity-30 disabled:hover:bg-white text-lg font-bold">➡️</button>

              <div className="w-full h-72 perspective-1000" onClick={() => setIsFlipped(!isFlipped)}>
                <div className={`w-full h-full duration-500 transform-style-3d relative cursor-pointer rounded-2xl shadow-xl border border-slate-200/60 ${isFlipped ? 'rotate-y-180' : ''}`}>
                  
                  {/* FRONT SIDE (ENGLISH) - עם כפתור הרמקול החדש */}
                  <div className="absolute inset-0 bg-white rounded-2xl backface-hidden flex flex-col justify-center items-center p-6">
                    <span className="text-xs font-black text-indigo-500 uppercase tracking-widest mb-1">English</span>
                    <h3 className="text-4xl font-extrabold text-slate-900 tracking-tight">{getFilteredWords()[currentIndex].english}</h3>
                    
                    {/* כפתור רמקול מובנה תחת המילה באנגלית ללא היפוך הכרטיסייה */}
                    <button onClick={(e) => { e.stopPropagation(); speakWord(getFilteredWords()[currentIndex].english); }} className="mt-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-4 py-1.5 rounded-full transition-all text-xs font-bold flex items-center gap-1 border border-indigo-100">
                      🔊 שמעי איך הוגים
                    </button>

                    <div className="mt-4 text-xs font-semibold text-slate-400">
                      סטטוס: {getFilteredWords()[currentIndex].status === 'V' ? <span className="text-emerald-500">יודעת! (V)</span> : <span className="text-rose-400">צריכה תרגול (X)</span>}
                    </div>
                    <p className="text-slate-400 text-[11px] mt-4 bg-slate-50 px-3 py-1 rounded-full border border-slate-100">לחצי על הכרטיסייה לגלות את התרגום ✨</p>
                  </div>

                  {/* BACK SIDE (HEBREW) */}
                  <div className="absolute inset-0 bg-indigo-600 text-white rounded-2xl backface-hidden rotate-y-180 flex flex-col justify-center items-center p-6 shadow-inner">
                    <span className="text-xs font-black text-indigo-200 uppercase tracking-widest mb-2">עברית</span>
                    <h3 className="text-4xl font-extrabold tracking-tight">{getFilteredWords()[currentIndex].hebrew}</h3>
                  </div>

                </div>
              </div>

              <button onClick={() => { if(currentIndex < getFilteredWords().length - 1) { setCurrentIndex(currentIndex + 1); setIsFlipped(false); } }} disabled={currentIndex === getFilteredWords().length - 1} className="bg-white hover:bg-indigo-50 border border-slate-200 p-3 rounded-full shadow-sm transition-all disabled:opacity-30 disabled:hover:bg-white text-lg font-bold">⬅️</button>
            </div>

            <div className="space-y-3 max-w-sm mx-auto pt-2">
              <div className="flex gap-3">
                <button onClick={() => handleWordStatus(getFilteredWords()[currentIndex].id, 'V')} className={`w-1/2 py-3.5 px-4 rounded-xl font-bold transition-all shadow-md active:scale-95 ${getFilteredWords()[currentIndex].status === 'V' ? 'bg-emerald-600 text-white ring-4 ring-emerald-100' : 'bg-white border border-emerald-200 text-emerald-600 hover:bg-emerald-50'}`}>ידעתי! V 👍</button>
                <button onClick={() => handleWordStatus(getFilteredWords()[currentIndex].id, 'X')} className={`w-1/2 py-3.5 px-4 rounded-xl font-bold transition-all shadow-md active:scale-95 ${getFilteredWords()[currentIndex].status === 'X' ? 'bg-rose-600 text-white ring-4 ring-rose-100' : 'bg-white border border-rose-200 text-rose-600 hover:bg-rose-50'}`}>לא ידעתי... X ❌</button>
              </div>
            </div>
          </div>
        )}
        {page === 'practice' && getFilteredWords().length === 0 && (
          <div className="text-center p-12 bg-white rounded-2xl border border-slate-200">
            <p className="text-lg font-bold text-slate-700">אין מילים העונות על סינון זה כרגע ביחידה! 🎉</p>
            <button onClick={fetchDashboard} className="mt-4 bg-indigo-600 text-white px-6 py-2 rounded-xl">חזרה לדשבורד</button>
          </div>
        )}

        {/* PAGE 5: WORD DIRECTORY LIST (תצוגת הרשימה הרחבה החדשה) */}
        {page === 'word_list' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
              <div>
                <h3 className="font-black text-xl text-slate-900">{selectedUnitName}</h3>
                <p className="text-xs text-slate-400 mt-0.5">מאגר המילים המלא — לעיון, האזנה ומעקב סטטוס</p>
              </div>
              <button onClick={fetchDashboard} className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl transition-all font-bold shadow-md shadow-indigo-100">חזרה לבית 🏠</button>
            </div>

            <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-right border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                      <th className="p-4">המילה באנגלית</th>
                      <th className="p-4">הקראה</th>
                      <th className="p-4">תרגום לעברית</th>
                      <th className="p-4 text-center">סטטוס נוכחי</th>
                      <th className="p-4 text-center">עריכת סימון מהירה</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm font-medium text-slate-700">
                    {words.map((word) => (
                      <tr key={word.id} className="hover:bg-slate-50/80 transition-all">
                        {/* אנגלית */}
                        <td className="p-4 font-bold text-slate-900 text-base tracking-tight">{word.english}</td>
                        
                        {/* רמקול להקראה */}
                        <td className="p-4">
                          <button onClick={() => speakWord(word.english)} className="text-base bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 p-1.5 rounded-full transition-all" title="הקראת מילה">🔊</button>
                        </td>
                        
                        {/* עברית */}
                        <td className="p-4 text-slate-600">{word.hebrew}</td>
                        
                        {/* סטטוס ויזואלי */}
                        <td className="p-4 text-center">
                          {word.status === 'V' ? (
                            <span className="inline-block bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full border border-emerald-200 shadow-sm">יודעת! V</span>
                          ) : (
                            <span className="inline-block bg-rose-100 text-rose-700 text-xs font-bold px-2.5 py-1 rounded-full border border-rose-200 shadow-sm">לא יודעת X</span>
                          )}
                        </td>
                        
                        {/* עריכה מהירה מתוך הטבלה */}
                        <td className="p-4 text-center">
                          <div className="inline-flex gap-1.5 bg-slate-100 p-1 rounded-lg">
                            <button onClick={() => handleWordStatus(word.id, 'V')} className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${word.status === 'V' ? 'bg-emerald-500 text-white shadow-sm' : 'text-slate-500 hover:text-emerald-600'}`}>V</button>
                            <button onClick={() => handleWordStatus(word.id, 'X')} className={`px-2.5 py-1 text-xs font-bold rounded-md transition-all ${word.status === 'X' ? 'bg-rose-500 text-white shadow-sm' : 'text-slate-500 hover:text-rose-600'}`}>X</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* PAGE 4: THE EXAM ARENA */}
        {page === 'exam' && examWords.length > 0 && !examFinished && (
          <div className="space-y-6 text-center">
            <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm flex justify-between items-center">
              <span className="font-bold text-slate-800">בחינה רנדומלית בתהליך 📝</span>
              <span className="text-sm font-bold text-amber-600 bg-amber-50 px-3 py-1 rounded-full">שאלה {currentIndex + 1} מתוך {examWords.length}</span>
            </div>

            <div className="w-full max-w-md mx-auto h-64 bg-white rounded-2xl shadow-lg border border-slate-200 flex flex-col justify-center items-center p-6 my-8" onClick={() => setIsFlipped(!isFlipped)}>
              {!isFlipped ? (
                <>
                  <span className="text-xs font-bold text-slate-300 uppercase mb-2">המילה באנגלית:</span>
                  <h3 className="text-4xl font-black text-slate-900">{examWords[currentIndex].english}</h3>
                  
                  <button onClick={(e) => { e.stopPropagation(); speakWord(examWords[currentIndex].english); }} className="mt-3 bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full transition-all text-xs font-bold">
                    🔊 הקשבה
                  </button>
                  
                  <p className="text-slate-400 text-xs mt-6">לחצי כדי לחשוף את התשובה הנכונה ולבדוק את עצמך</p>
                </>
              ) : (
                <>
                  <span className="text-xs font-bold text-emerald-500 uppercase mb-2">התרגום הנכון הוא:</span>
                  <h3 className="text-4xl font-black text-emerald-600 mb-4">{examWords[currentIndex].hebrew}</h3>
                </>
              )}
            </div>

            {isFlipped && (
              <div className="flex justify-center gap-4 max-w-xs mx-auto transition-all">
                <button onClick={() => handleExamAnswer(true)} className="w-1/2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl shadow-md">צדקתי! ✅</button>
                <button onClick={() => handleExamAnswer(false)} className="w-1/2 bg-rose-500 hover:bg-rose-600 text-white font-bold py-3 rounded-xl shadow-md">טעיתי... ❌</button>
              </div>
            )}
          </div>
        )}

        {/* EXAM COMPILATION SUMMARY */}
        {page === 'exam' && examFinished && (
          <div className="bg-white border border-slate-200 shadow-xl rounded-2xl p-8 max-w-md mx-auto text-center space-y-6">
            <h3 className="text-3xl font-black text-slate-900">סיכום המבחן שלך 🏁</h3>
            <div className="text-7xl font-black text-indigo-600 bg-indigo-50 py-6 rounded-2xl border border-indigo-100">{getExamGrade()}%</div>
            <p className="text-slate-700 font-medium px-4">{getMotivationalMessage(getExamGrade())}</p>
            <div className="grid grid-cols-2 gap-4 border-t border-b border-slate-100 py-4 text-sm">
              <div>
                <span className="block text-slate-400 font-medium">מילים שידעת</span>
                <span className="text-2xl font-bold text-emerald-500">{examAnswers.filter(a => a.correct).length}</span>
              </div>
              <div>
                <span className="block text-slate-400 font-medium">טעויות</span>
                <span className="text-2xl font-bold text-rose-500">{examAnswers.filter(a => !a.correct).length}</span>
              </div>
            </div>
            <button onClick={fetchDashboard} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold p-3 rounded-xl shadow-lg transition-all">חזרה לעמוד הבית 🏠</button>
          </div>
        )}

      </div>
    </div>
  );
}

export default App;