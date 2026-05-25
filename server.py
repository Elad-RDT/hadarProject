from flask import Flask, request, jsonify, session
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta

app = Flask(__name__)
app.config['SECRET_KEY'] = 'hadar_secret_key_123'
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///hadarcabulary.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# מאפשר ל-React (פורט 5173) לדבר עם הפייתון
CORS(app, supports_credentials=True, origins=["http://localhost:5173"])
db = SQLAlchemy(app)

# ----------------- DB MODELS -----------------

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    phone_number = db.Column(db.String(20), unique=True, nullable=False)
    first_name = db.Column(db.String(50), nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    current_streak = db.Column(db.Integer, default=0)
    last_practice_date = db.Column(db.String(20), nullable=True)

class Unit(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)

class Word(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('unit.id'), nullable=False)
    english = db.Column(db.String(100), nullable=False)
    hebrew = db.Column(db.String(100), nullable=False)

class UserProgress(db.Model):
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), primary_key=True)
    word_id = db.Column(db.Integer, db.ForeignKey('word.id'), primary_key=True)
    status = db.Column(db.String(1), default='X') # 'V' = יודע, 'X' = לא יודע

# ----------------- API ENDPOINTS -----------------

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    if User.query.filter_by(phone_number=data['phone_number']).first():
        return jsonify({'error': 'מספר הטלפון כבר קיים במערכת!'}), 400
    
    hashed_password = generate_password_hash(data['password'])
    new_user = User(
        phone_number=data['phone_number'],
        first_name=data['first_name'],
        password_hash=hashed_password
    )
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'message': 'נרשמת בהצלחה! מוזמנת להתחבר'})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(phone_number=data['phone_number']).first()
    if not user or not check_password_hash(user.password_hash, data['password']):
        return jsonify({'error': 'אופס... מספר טלפון או סיסמה לא נכונים'}), 401
    
    session['user_id'] = user.id
    return jsonify({'message': f'היי {user.first_name}, טוב לראות אותך!', 'first_name': user.first_name})

@app.route('/api/dashboard', methods=['GET'])
def get_dashboard():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'אנא התחברי קודם'}), 401
    
    user = User.query.get(user_id)
    units = Unit.query.all()
    
    units_data = []
    for u in units:
        words = Word.query.filter_by(unit_id=u.id).all()
        total_words = len(words)
        
        # ספירת כמה מילים סומנו כ-V עבור המשתמש הנוכחי ביחידה הזו
        word_ids = [w.id for w in words]
        known_words = UserProgress.query.filter(
            UserProgress.user_id == user_id,
            UserProgress.word_id.in_(word_ids),
            UserProgress.status == 'V'
        ).count()
        
        progress_percent = int((known_words / total_words) * 100) if total_words > 0 else 0
        units_data.append({
            'id': u.id,
            'name': u.name,
            'total_words': total_words,
            'known_words': known_words,
            'progress': progress_percent
        })
        
    return jsonify({
        'first_name': user.first_name,
        'streak': user.current_streak,
        'units': units_data
    })

@app.route('/api/words/<int:unit_id>', methods=['GET'])
def get_words(unit_id):
    user_id = session.get('user_id')
    if not user_id:
         return jsonify({'error': 'Unauthorized'}), 401
         
    words = Word.query.filter_by(unit_id=unit_id).all()
    words_list = []
    
    for w in words:
        progress = UserProgress.query.filter_by(user_id=user_id, word_id=w.id).first()
        status = progress.status if progress else 'X'
        words_list.append({
            'id': w.id,
            'english': w.english,
            'hebrew': w.hebrew,
            'status': status
        })
    return jsonify(words_list)

@app.route('/api/update-word', methods=['POST'])
def update_word():
    user_id = session.get('user_id')
    if not user_id:
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.json
    progress = UserProgress.query.filter_by(user_id=user_id, word_id=data['word_id']).first()
    
    if progress:
        progress.status = data['status']
    else:
        progress = UserProgress(user_id=user_id, word_id=data['word_id'], status=data['status'])
        db.session.add(progress)
        
    # עדכון מנגנון הסטריקים בעת תרגול
    user = User.query.get(user_id)
    today_str = datetime.now().strftime('%Y-%m-%d')
    yesterday_str = (datetime.now() - timedelta(days=1)).strftime('%Y-%m-%d')
    
    if user.last_practice_date == yesterday_str:
        user.current_streak += 1
    elif user.last_practice_date != today_str:
        user.current_streak = 1
        
    user.last_practice_date = today_str
    db.session.commit()
    
    return jsonify({'success': True, 'streak': user.current_streak})

# ----------------- SEEDING DATA (מילוי מילים אוטומטי) -----------------

def seed_data():
    # בדיקה והכנסה של יחידה 1
    unit1 = Unit.query.filter_by(id=1).first()
    if unit1 is None:
        unit1 = Unit(id=1, name="יחידה 1: מילות קישור, זמן ומיקום")
        db.session.add(unit1)
        db.session.commit()

    # בדיקה והכנסה של יחידה 2
    unit2 = Unit.query.filter_by(id=2).first()
    if unit2 is None:
        unit2 = Unit(id=2, name="יחידה 2: אוצר מילים כללי ופעלים מרכזיים")
        db.session.add(unit2)
        db.session.commit()

    # בדיקה והכנסה של יחידה 3
    unit3 = Unit.query.filter_by(id=3).first()
    if unit3 is None:
        unit3 = Unit(id=3, name="יחידה 3: אוצר מילים מתקדמת ואקדמית")
        db.session.add(unit3)
        db.session.commit()

    # 🚀 הזרקת יחידה 4 החדשה של אלעד
    unit4 = Unit.query.filter_by(id=4).first()
    if unit4 is None:
        unit4 = Unit(id=4, name="יחידה 4: אוצר מילים מורחב וביטויים נפוצים")
        db.session.add(unit4)
        db.session.commit()

        # בנק המילים המלא של יחידה 4 מתורגם ומיושר
        raw_words_unit4 = [
            ("abandon", "לנטוש / לעזוב לחלוטין"), ("abduct", "לחטוף (אדם)"), ("abide", "לציית / לשכון / לסבול"), 
            ("absence", "היעדרות / חוסר"), ("absent", "נעדר / לא נמצא"), ("absorb", "לספוג / לקלוט"), 
            ("abundance", "שפע / רוב"), ("abuse", "התעללות / שימוש לרעה"), ("abuse", "להתעלל / לבצע שימוש לרעה"), 
            ("accumulate", "לצבור / לאגור"), ("acquire", "לרכוש / להשיג"), ("acquisition", "רכישה / נכס"), 
            ("adopt", "לאמץ (ילד/רעיון)"), ("adventure", "הרפתקה"), ("affect", "להשפיע על"), 
            ("affection", "חיבה / אהבה"), ("affluence", "שפע / עושר"), ("fluent", "עשיר / בעל שפע"), 
            ("aid", "עזרה / סיוע / לסייע"), ("airborne", "מוטס / נישא באוויר"), ("airline", "חברת תעופה"), 
            ("airplane", "מטוס"), ("alike", "דומה / באותו אופן"), ("allow", "להרשות / לאפשר"), 
            ("ally (allies)", "בעל ברית / בריתות"), ("alter", "לשנות / לתקן"), ("alterations", "שינויים / תיקונים"), 
            ("alternately", "לסירוגין"), ("amateur", "חובבן / לא מקצועי"), ("amend", "לתקן / לשפר (חוק)"), 
            ("analyze", "לנתח (נתונים/מצב)"), ("anticipate", "לצפות מראש"), ("anxious", "חרד / דאגן"), 
            ("anxious", "להוט / משתוקק"), ("apparent", "גלוי / גלוי לעין / לכאורה"), ("apparently", "ככל הנראה / כפי הנראה"), 
            ("apply", "ליישם / להחיל / להגיש מועמדות"), ("appreciate", "להעריך / להוקיר"), ("appreciation", "הערכה / הוקרה"), 
            ("appropriately", "כראוי / בהתאם"), ("arise", "להתעורר / לנבוע מ-"), ("arise, arose", "קם / נוצר (עבר: arose)"), 
            ("artificial", "מלאכותי"), ("aside", "הצידה / בצד"), ("aside", "מלבד (כשבא עם from)"), 
            ("assess", "להעריך (שווי/נזק/מצב)"), ("asset", "נכס / קניין"), ("assign", "להקצות / להטיל משימה"), 
            ("assignment", "משימה / מטלה"), ("attain", "להשיג / להגיע ל-"), ("attend", "נוכח / להשתתף ב- / לטפל ב-"), 
            ("attendant", "מלווה / סדרן / דייל"), ("authority", "סמכות / רשות"), ("authorize", "להסמיך / לאשר"), 
            ("autumn", "סתיו"), ("await", "לחכות ל- / לצפות"), ("awareness", "מודעות"), 
            ("bare", "חשוף / עירום / פשוט"), ("behave", "להתנהג"), ("behavior", "התנהגות"), 
            ("bounce", "לקפץ / לחזור / החזרה"), ("brilliant", "מבריק / גאוני / זוהר"), ("burden", "נטל / משא / להעמיס"), 
            ("bush", "שיח"), ("bush", "סבך / אזור פראי"), ("cable", "כבל / מברק"), 
            ("calculate", "לחשב"), ("calculator", "מחשבון"), ("campaign", "קמפיין / מסע בחירות / מערכה"), 
            ("candid", "גלוי לב / ישר / כנה"), ("candidate", "מועמד"), ("case", "מקרה / תיק (משפטי/רפואי)"), 
            ("case", "קופסה / נרתיק"), ("categorize", "לסווג לקטגוריות"), ("cautious", "זהיר"), 
            ("century", "מאה (100 שנה)"), ("charge", "מחיר / לטעון (סוללה/אשמה)"), ("charge", "להאשים / אשמה"), 
            ("charge", "פיקוח / אחריות (In charge)"), ("charge", "להסתער"), ("charge", "מטען (חשמלי)"), 
            ("chart", "תעודה / מפה / תרשים"), ("claim", "טענה / לטעון / תביעה"), ("claim", "לדרוש בבעלות"), 
            ("coincide", "להתלכד / להתרחש באותו זמן"), ("colossal", "עצום / כביר"), ("commence", "להתחיל"), 
            ("compress", "לדחוס / לכווץ"), ("comprise", "להכיל / לכלול / להיות מורכב מ-"), ("concept", "מושג / קונספט"), 
            ("conception", "תפיסה / מושג / התעברות"), ("confer", "להעניק (תואר/פרס)"), ("confer", "להתייעץ"), 
            ("conference", "ועידה / כנס"), ("confide", "לספר בסוד / לבטוח ב-"), ("confident", "בטוח בעצמו"), 
            ("conflict", "עימות / סכסוך / להתנגש"), ("conjecture", "השערה / לנחש"), ("connect", "לחבר / לקשר"), 
            ("consequence", "תוצאה / השלכה"), ("consider", "לשקול / להתחשב ב- / להחשיב"), ("considerable", "ניכר / משמעותי"), 
            ("consume", "לצרוך / לעכל / לכלות"), ("consumers", "צרכנים"), ("contain", "להכיל / לכלול"), 
            ("contemporary", "בן זמננו / עכשווי"), ("convenient", "נוח"), ("conveniently", "בנוחות"), 
            ("convention", "מוסכמה / ועידה / כנס"), ("convention", "אמנה"), ("conventional", "קונבנציונלי / שגרתי"), 
            ("convert", "להמיר / לשנות / להחליף"), ("convert", "להמיר דת"), ("convey", "להעביר (מסר/מטען)"), 
            ("courageous", "אמיץ / נועז"), ("create", "ליצור"), ("creator", "יוצר / בורא"), 
            ("creature", "יצור / בריאה"), ("currency", "מטבע / מחזור כספים"), ("custom", "מנהג / הרגל"), 
            ("custom", "מכס (בצורת רבים: Customs)"), ("customer", "לקוח"), ("customize", "להתאים אישית"), 
            ("damage", "נזק / להזיק"), ("decade", "עשור (10 שנים)"), ("defeat", "תבוסה / להביס"), 
            ("defeated", "מובס / מיואש"), ("defend", "להגן על"), ("defense", "הגנה / סנגוריה"), 
            ("deficiency", "מחסור / ליקוי"), ("deliver", "למסור / להוביל משלוח / ליילד"), ("delivery", "משלוח / לידה"), 
            ("demographic", "דמוגרפי / קשור לאוכלוסייה"), ("demonstrate", "להדגים / להוכיח"), ("demonstrate", "להפגין"), 
            ("destination", "יעד / מחוז חפץ"), ("detach", "לנתק / להפריד"), ("deteriorate", "להידרדר / להחמיר"), 
            ("diagnose", "לאבחן"), ("director", "מנהל / במאי"), ("director", "חבר דירקטוריון"), 
            ("discriminate", "להפלות / להבחין בין"), ("dismiss", "לפטר / לפזר / לבטל"), ("disposable", "חד-פעמי / זמין לשימוש"), 
            ("disrupt", "לשבש / להפריע"), ("distribute", "לחלק / להפיץ"), ("distribution", "הפצה / חלוקה"), 
            ("document", "מסמך"), ("document", "לתעד"), ("duty", "חובה / תפקיד / מכס"), 
            ("earn", "להרוויח (בזכות) / להשתכר"), ("economy", "כלכלה / חיסכון"), ("edge", "קצה / להב / יתרון"), 
            ("elaborate", "להרחיב / לפרט / מורכב"), ("elect", "לבחור (בבחירות) / נבחר"), ("emerge", "להגיח / להופיע / להתגלות"), 
            ("emigrate", "להגר (החוצה ממדינה)"), ("eminent", "דגול / בולט / רם מעלה"), ("enclose", "לצרף / להקיף / לסגור פנימה"), 
            ("enlarge", "להגדיל / להרחיב"), ("ensure", "להבטיח / לוודא"), ("environment", "סביבה"), 
            ("epidemic", "מגיפה"), ("equivalent", "שווה ערך / מקביל"), ("erase", "למחוק"), 
            ("eraser", "מחק"), ("establish", "להקים / לייסד / לבסס"), ("estimate", "הערכה / להעריך"), 
            ("ethical", "אתי / מוסרי"), ("evade", "להתחמק מ- / להשתמט"), ("evidence", "ראיות / עדות"), 
            ("exception", "חריג / יוצא מן הכלל"), ("execute", "להוציא לפועל / לבצע"), ("execute", "להוציא להורג"), 
            ("facility", "מתקן / מבנה / מיומנות"), ("fail", "להיכשל"), ("failure", "כישלון"), 
            ("faith", "אמונה / נאמנות"), ("fall", "ליפול / נפילה / סתיו"), ("feature", "מאפיין / תכונה"), 
            ("feature", "טור קבוע / כתבה מרכזית"), ("feature", "לארח / להציג כפיצ'ר"), ("flourish", "לשגשג / לפרוח"), 
            ("follow", "לעקוב / לבוא אחרי / לציית"), ("for the sake of", "למען / בשביל"), ("force", "כוח / לאלץ"), 
            ("force", "כוח (צבאי/משטרתי)"), ("forsake", "לנטוש / לעזוב לחלוטין"), ("found", "מצא (עבר של find)"), 
            ("found", "לייסד / להקים (פועל בבסיס)"), ("foundation", "יסוד / קרן / בסיס (מייקאפ)"), ("function", "תפקוד / פונקציה / לתפקד"), 
            ("future", "עתיד / עתידי"), ("gather", "לאסוף / לקבץ / להבין"), ("global", "עולמי / גלובלי"), 
            ("goal", "מטרה / יעד / שער"), ("goods", "סחורות / טובין"), ("grasp", "לתפוס / לאחוז"), 
            ("grasp", "תפיסה / הבנה"), ("group", "קבוצה / לקבץ"), ("hardly", "בקושי / כמעט שלא"), 
            ("hesitate", "להסס"), ("hold back", "לעצור / לרסן / לעכב"), ("homeland", "מולדת"), 
            ("honest", "ישר / כנה"), ("honor", "כבוד / לכבד"), ("huge", "עצום / ענק"), 
            ("idea", "רעיון / מושג"), ("identify", "לזהות / להזדהות"), ("illegal", "בלתי חוקי"), 
            ("image", "תמונה / בבואה / תדמית"), ("imagination", "דמיון"), ("imagine", "לדמיין / לשער"), 
            ("impair", "לפגום / להחליש"), ("impart", "להעניק / להקנות (ידע/תכונה)"), ("impartially", "ללא משוא פנים / בניטרליות"), 
            ("import", "יבוא / לייבא / חשיבות"), ("impose", "לכפות / להטיל (מס/עונש)"), ("impossible", "בלתי אפשרי"), 
            ("imprisoned", "כלוא / אסור"), ("improve", "לשפר / להשתפר"), ("improvise", "לאלתר"), 
            ("in order", "תקין / לפי הסדר / כדי ל- (כשבא עם to)"), ("increase", "להגדיל / הגדלה / עלייה"), ("incredible", "לא יאומן / מדהים"), 
            ("individual", "פרט / אינדיבידואל / יחיד"), ("industry", "תעשייה / חרוצות"), ("inferred", "הסיק / מוסק"), 
            ("inform", "ליידע / לעדכן"), ("information", "מידע / אינפורמציה"), ("innovate", "לחדש / להמציא"), 
            ("intention", "כוונה"), ("intentional", "מכוון / בזדון"), ("interact", "לתקשר / להשפיע זה על זה"), 
            ("interest", "עניין / לעניין / ריבית"), ("interest", "אינטרס / טובת אישית"), ("internal", "פנימי"), 
            ("interpretation", "פרשנות / פירוש"), ("involve", "לערב / לכלול / להצריך"), ("isolate", "לבודד"), 
            ("judgment", "שיפוט / פסק דין / תבונה"), ("know, knew", "לדעת (עבר: knew, בינוני: known)"), ("knowledge", "ידע"), 
            ("known", "ידוע / מוכר"), ("laid", "הניח / הטיל (עבר של lay)"), ("lane", "נתיב / סמטה"), 
            ("launch", "להשיק / לשגר / השקה"), ("launch", "סירת מנוע גדולה"), ("limit", "גבול / להגביל / מגבלה"), 
            ("limitation", "מגבלה / צמצום"), ("lobby", "מבואה / לובי"), ("lobby", "ללחוץ / לקדם אינטרסים (פועל)"), 
            ("mammal", "יונק / בעל חיים מניק"), ("moderate", "מתון / למתן"), ("moderate", "להנחות דיון"), 
            ("modernize", "לחדש / להפוך למודרני"), ("mold", "עובש / פטרייה"), ("mold", "תבנית / לעצב בתבנית"), 
            ("motivate", "להניע / לעורר מוטיבציה"), ("negate", "לשלול / לבטל"), ("neutral", "ניטרלי"), 
            ("numerous", "רבים / מספר גדול של"), ("nutrition", "תזונה"), ("object", "חפץ / עצם / מטרה"), 
            ("object", "להתנגד (פועל)"), ("obtain", "להשיג / לקבל"), ("operate", "להפעיל / לפעול"), 
            ("operate", "לנתח (רפואית)"), ("operation", "פעולה / מבצע / הפעלה"), ("operation", "ניתוח (רפואי)"), 
            ("opposition", "התנגדות / אופוזיציה"), ("ordinary", "רגיל / פשוט / שגרתי"), ("organ", "איבר בגוף"), 
            ("organ", "עוגב (כלי נגינה)"), ("organization", "ארגון / ארגון מחדש"), ("organize", "לארגן / לסדר"), 
            ("outbreak", "התפרצות (של מחלה/מלחמה)"), ("overdo", "להגזים / לעשות יותר מדי"), ("overdue", "באיחור / שעבר זמנו"), 
            ("pace", "קצב / פסיעה / לצעוד"), ("pair", "זוג / לצמד"), ("parent", "הורה"), 
            ("parenting", "הורות / גידול ילדים"), ("participate", "להשתתף ב-"), ("particular", "מסוים / ספציפי / קפדן"), 
            ("particulars", "פרטים / פרטים מלאים"), ("pause", "הפסקה / לעצור זמנית"), ("persist", "להתמיד / להתעקש / להישאר"), 
            ("person", "אדם / אישיות"), ("personal", "אישי / פרטי"), ("personality", "אישיות / אופי"), 
            ("phase", "שלב / פאזה / תקופה"), ("phenomenon", "תופעה"), ("pioneer", "חלוץ / ראשון בתחום"), 
            ("position", "עמדה / תנוחה / תפקיד"), ("position", "מיקום / למקם"), ("position", "דעה / תפיסה"), 
            ("possible", "אפשרי"), ("poverty", "עוני"), ("poverty-stricken", "מוכה עוני / עני מרוד"), 
            ("precedent", "תקדים"), ("preceding", "הקודם / שבא לפני"), ("predecessors", "קודמים בתפקיד / אבות קדמונים"), 
            ("predestined", "נקבע מראש / נגזר מראש"), ("predict", "לחזות / לנבא"), ("prediction", "תחזית / ניבוי"), 
            ("predictive", "חיזוי / בעל יכולת ניבוי"), ("premature", "לפני הזמן / פג"), ("private", "פרטי / טוראי (דרגה)"), 
            ("produce", "לייצר / להפיק"), ("produce", "תוצרת חקלאית (שם עצם)"), ("product", "מוצר / תוצר"), 
            ("profession", "מקצוע / משלח יד"), ("professional", "מקצועי / מקצוען"), ("profound", "עמוק / מעמיק"), 
            ("profound", "מוחלט / נחרץ"), ("profoundly", "עמוקות / בצורה מוחלטת"), ("promise", "הבטחה / להבטיח"), 
            ("property", "רכוש / נכס"), ("property", "תכונה / מאפיין"), ("protest", "מחאה / להפגין / למחות"), 
            ("prove", "להוכיח / להתברר כ-"), ("public", "ציבור / ציבורי / פומבי"), ("race", "מרוץ / לתחר / לרוץ מהר"), 
            ("race", "גזע (מוצא)"), ("rail", "מעקה / מסילה"), ("railroad", "מסילת רכבת"), 
            ("random", "אקראי"), ("randomly", "באופן אקראי"), ("reaction", "תגובה / ריאקציה"), 
            ("reasonable", "סביר / הגיוני"), ("reconstruct", "לשחזר / לבנות מחדש"), ("refute", "להפריך / לסתור"), 
            ("regain", "להשיג בחזרה / לזכות מחדש"), ("regard", "להביט / להחשיב / כבוד / מבט"), ("relate", "לקשר / להתייחס / לספר"), 
            ("release", "לשחרר / שחרור / פרסום"), ("relevant", "רלוונטי / קשור לנושא"), ("relocate", "לשנות מיקום / לעבור מקום"), 
            ("reluctant", "מסתייג / לא שש / סרבן"), ("rely", "להסתמך על / לבטוח ב-"), ("remote", "רחוק / מבודד / שלט רחוק"), 
            ("report", "דיווח / דוח / לדווח"), ("reporter", "כתב / עיתונאי"), ("request", "בקשה / לבקש"), 
            ("require", "לדרוש / להצריך"), ("restore", "לשחזר / להחזיר למצב קודם"), ("resume", "לחדש / להמשיך אחרי הפסקה"), 
            ("resumption", "חידוש / המשך"), ("rule", "חוק / כלל / לשלוט"), ("rule", "פסק דין (פועל)"), 
            ("ruler", "סרגל"), ("ruler", "שליט"), ("season", "עונה / לתבל"), 
            ("season", "להרגיל / לחסן"), ("secure", "מאובטח / בטוח / להבטיח / להשיג"), ("selective", "סלקטיבי / בררני"), 
            ("service", "שירות / לשרת"), ("share", "לחלוק / לשתף / מניה"), ("share", "חלק / נתח"), 
            ("ship", "אונייה / כלי שיט"), ("ship", "לשלוח (סחורה)"), ("shipment", "משלוח / מטען"), 
            ("significance", "חשיבות / משמעות"), ("significant", "משמעותי / חשוב"), ("simulate", "לדמות / לעשות סימולציה"), 
            ("size", "גודל / לדרג לפי גודל"), ("soar", "לנסוק / להמריא / לעלות פלאים"), ("soil", "אדמה / קרקע"), 
            ("soil", "ללכלך (פועל)"), ("solicit", "לשדל / להפציר / לנסות להשיג"), ("solicit", "לפתות"), 
            ("solitude", "בדידות / יחידות (מתוך בחירה)"), ("solution", "פתרון / תמיסה"), ("sort", "סוג / למיין"), 
            ("source", "מקור"), ("span", "משך / מרווח / להשתרע על פני"), ("span", "טווח"), 
            ("splendid", "מצוין / מפואר / נהדר"), ("spring", "קפיץ / מעיין / אביב"), ("spring", "לקפוץ / לזנק"), 
            ("spring, sprang", "נבע / זינק (עבר: sprang)"), ("stability", "יציבות"), ("stamina", "כוח עמידה / סיבולת"), 
            ("standard", "תקן / סטנדרט / סטנדרטי"), ("state", "מדינה / מדינתי"), ("state", "מצב / להצהיר / לנסח"), 
            ("statement", "הצהרה / טענה / תדפיס"), ("steady", "יציב / קבוע / קבוע (בן זוג)"), ("stimulate", "לגרות / לעורר / לתמרץ"), 
            ("stock", "מלאי / לאחסן במלאי"), ("stock", "מניות (בבורסה)"), ("stock", "ציר (מרק)"), 
            ("strange", "מוזר / זר"), ("strive", "לשאוף / לחתור בתוקף"), ("successor", "יורש / ממשיך דרך"), 
            ("summer", "קיץ"), ("superior", "עליון / נעלה / מנהל ישיר"), ("supervise", "לפקח / להשגיח"), 
            ("support", "תמיכה / לתמוך / לכלכל"), ("supportive", "תומך"), ("survey", "סקר / לסקור"), 
            ("survey", "מדידה / מדידת שטח"), ("survive", "לשרוד"), ("swift", "מהיר / זריז"), 
            ("temporary", "זמני"), ("thick", "עבה / סמיך"), ("thick", "מרוכז / צפוף"), 
            ("thrive", "לשגשג / להצליח"), ("tradition", "מסורת"), ("traffic", "תנועה (בכביש) / סחר בלתי חוקי"), 
            ("traffic jam", "פקק תנועה"), ("transfer", "העברה / להעביר"), ("transfer", "כרטיס מעבר"), 
            ("tribe", "שבט"), ("unaware", "לא מודע ל-"), ("uncertain", "לא בטוח / מוטל בספק"), 
            ("unclear", "לא ברור"), ("uncover", "לחשוף / לגלות"), ("unfold", "לפרוש / לפתח / להתרחש"), 
            ("unfold", "להתגלות"), ("unit", "יחידה / תא"), ("unstable", "לא יציב"), 
            ("update", "עדכון / לעדכן"), ("upgrade", "שדרוג / לשדרג"), ("valid", "תקף / חוקי / הגיוני"), 
            ("validate", "לתת תוקף / לאשר / לאמת"), ("violence", "אלימות"), ("violent", "אלים"), 
            ("widely", "במידה רבה / באופן נרחב"), ("widen", "להרחיב / להתרחב"), ("winter", "חורף")
        ]

        for eng, heb in raw_words_unit4:
            w = Word(unit_id=unit4.id, english=eng, hebrew=heb)
            db.session.add(w)
        db.session.commit()
        print("🎉 יחידה 4 הוזרקה בהצלחה למסד הנתונים הנוכחי!")
    else:
        print("ℹ️ יחידה 4 כבר קיימת במסד הנתונים.")

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
        seed_data()

    # הרצה דינמית שמתאימה גם למחשב שלך וגם לענן
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)