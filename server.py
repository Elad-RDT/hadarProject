from flask import Flask, request, jsonify, session
from flask_cors import CORS
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime, timedelta
import os

app = Flask(__name__)
app.config['SECRET_KEY'] = 'hadar_secret_key_123'

# 1. הגדרת נתיב מוחלט למסד הנתונים כדי ש-Render לא יאבד אותו
basedir = os.path.abspath(os.path.dirname(__file__))
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///' + os.path.join(basedir, 'hadarcabulary.db')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# 2. הגדרות חובה כדי שעוגיות (התחברות) יעבדו בין שני דומיינים שונים בענן
app.config['SESSION_COOKIE_SAMESITE'] = 'None'
app.config['SESSION_COOKIE_SECURE'] = True

# 3. תיקון ה-CORS: אישור מדויק לנטליפיי ולמחשב שלך
CORS(app, supports_credentials=True, resources={
    r"/api/*": {
        "origins": ["http://localhost:5173", "https://hadarcabulary.netlify.app"]
    }
})

db = SQLAlchemy(app)

# --- Models ---
class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    first_name = db.Column(db.String(50), nullable=False)
    phone_number = db.Column(db.String(20), unique=True, nullable=False)
    password_hash = db.Column(db.String(200), nullable=False)
    streak = db.Column(db.Integer, default=0)
    last_practice_date = db.Column(db.Date, nullable=True)

class Unit(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)

class Word(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    unit_id = db.Column(db.Integer, db.ForeignKey('unit.id'), nullable=False)
    english = db.Column(db.String(100), nullable=False)
    hebrew = db.Column(db.String(100), nullable=False)

class UserProgress(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    word_id = db.Column(db.Integer, db.ForeignKey('word.id'), nullable=False)
    status = db.Column(db.String(10), default='X')

# --- Routes (כולם מתחילים ב- /api/ כמו שצריך) ---

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    if User.query.filter_by(phone_number=data['phone_number']).first():
        return jsonify({'error': 'מספר הטלפון כבר רשום במערכת'}), 400
    
    hashed_pw = generate_password_hash(data['password'])
    new_user = User(first_name=data['first_name'], phone_number=data['phone_number'], password_hash=hashed_pw)
    db.session.add(new_user)
    db.session.commit()
    return jsonify({'message': 'נרשמת בהצלחה! אפשר להתחבר.'})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    user = User.query.filter_by(phone_number=data['phone_number']).first()
    if user and check_password_hash(user.password_hash, data['password']):
        session['user_id'] = user.id
        return jsonify({'first_name': user.first_name})
    return jsonify({'error': 'פרטים לא נכונים, נסי שוב!'}), 401

@app.route('/api/dashboard', methods=['GET'])
def dashboard():
    if 'user_id' not in session:
        return jsonify({'error': 'Not logged in'}), 401
    
    user = User.query.get(session['user_id'])
    units = Unit.query.all()
    units_data = []
    
    for unit in units:
        total_words = Word.query.filter_by(unit_id=unit.id).count()
        known_words = db.session.query(UserProgress).join(Word).filter(
            UserProgress.user_id == user.id,
            Word.unit_id == unit.id,
            UserProgress.status == 'V'
        ).count()
        
        progress = int((known_words / total_words) * 100) if total_words > 0 else 0
        
        units_data.append({
            'id': unit.id,
            'name': unit.name,
            'total_words': total_words,
            'known_words': known_words,
            'progress': progress
        })
        
    return jsonify({
        'first_name': user.first_name,
        'streak': user.streak,
        'units': units_data
    })

@app.route('/api/words/<int:unit_id>', methods=['GET'])
def get_words(unit_id):
    if 'user_id' not in session:
        return jsonify({'error': 'Not logged in'}), 401
        
    user_id = session['user_id']
    words = Word.query.filter_by(unit_id=unit_id).all()
    words_data = []
    
    for w in words:
        progress = UserProgress.query.filter_by(user_id=user_id, word_id=w.id).first()
        status = progress.status if progress else 'X'
        words_data.append({
            'id': w.id,
            'english': w.english,
            'hebrew': w.hebrew,
            'status': status
        })
        
    return jsonify(words_data)

@app.route('/api/update-word', methods=['POST'])
def update_word():
    if 'user_id' not in session:
        return jsonify({'error': 'Not logged in'}), 401
        
    data = request.json
    user_id = session['user_id']
    user = User.query.get(user_id)
    
    progress = UserProgress.query.filter_by(user_id=user_id, word_id=data['word_id']).first()
    if progress:
        progress.status = data['status']
    else:
        progress = UserProgress(user_id=user_id, word_id=data['word_id'], status=data['status'])
        db.session.add(progress)
        
    today = datetime.now().date()
    if user.last_practice_date != today:
        if user.last_practice_date == today - timedelta(days=1):
            user.streak += 1
        else:
            user.streak = 1
        user.last_practice_date = today

    db.session.commit()
    return jsonify({'streak': user.streak})
# ----------------- SEEDING DATA (מילוי מילים אוטומטי) -----------------

def seed_data():
    # --- יחידה 1 ---
    u1 = Unit.query.get(1)
    if not u1:
        u1 = Unit(id=1, name="יחידה 1: מילות קישור, זמן ומיקום")
        db.session.add(u1)
        db.session.commit()
        w1 = [
            ("although", "למרות ש-"), ("because", "גלל ש- / מפני ש-"), ("but", "אבל"), ("however", "אולם / ברם"), ("therefore", "לכן / לפיכך"),
            ("furthermore", "יתרה מכך"), ("in addition", "בנוסף"), ("besides", "חוץ מזה / בנוסף"), ("meanwhile", "בינתיים"), ("since", "מאז / מכיוון ש-"),
            ("until", "עד ש- / עד"), ("before", "לפני"), ("after", "אחרי"), ("during", "במהלך / בזמן"), ("recently", "לאחרונה"),
            ("lately", "בזמן האחרון"), ("currently", "כעת / כרגע"), ("soon", "בקרוב"), ("suddenly", "פתאום"), ("immediately", "מיד / מיידית"),
            ("above", "מעל"), ("below", "מתחת"), ("behind", "מאחורי"), ("in front of", "בפני / מקדימה"), ("between", "בין (שני דברים)"),
            ("among", "בקרב / בין (רבים)"), ("under", "מתחת ל-"), ("over", "מעל / מעבר"), ("near", "קרוב"), ("far", "רחוק"),
            ("next to", "ליד / בצמוד ל-"), ("inside", "בתוך"), ("outside", "בחוץ / מחוץ ל-"), ("opposite", "מול / הפוך"), ("across", "מעבר ל-"),
            ("through", "דרך / באמצעות"), ("towards", "לעבר / לכיוון"), ("beyond", "מעבר ל- / מחוץ לטווח"), ("corner", "פינה"),
            ("everywhere", "בכל מקום"), ("nowhere", "שום מקום"), ("somewhere", "איפשהו / מקום כלשהו"), ("anywhere", "כל מקום שהוא")
        ]
        for e, h in w1: db.session.add(Word(unit_id=1, english=e, hebrew=h))
        db.session.commit()

    # --- יחידה 2 ---
    u2 = Unit.query.get(2)
    if not u2:
        u2 = Unit(id=2, name="יחידה 2: אוצר מילים כללי ופעלים מרכזיים")
        db.session.add(u2)
        db.session.commit()
        w2 = [
            ("ability", "יכולת"), ("able", "מסוגל"), ("accept", "לקבל / להסכים"), ("acceptable", "קביל / מקובל"), ("acceptance", "קבלה / הסכמה"), ("accident", "תאונה"),
            ("achieve", "להשיג / להגיע להישג"), ("activate", "להפעיל"), ("active", "פעיל"), ("actor", "שחקן"), ("actual", "ממשי / בפועל"), ("actually", "בעצם / למעשה"),
            ("addition", "תוספת / חיבור"), ("address", "כתובת / לנאום / לפנות אל"), ("adjust", "להתאים / לכוונן / להתרגל"), ("afford", "להרשות לעצמו כספית"), ("afraid", "מפוחד / חושש"), ("agree", "להסכים"),
            ("agreement", "הסכם / קבוצה"), ("aim", "מטרה / לכוון"), ("alarm", "אזעקה / להבהיל"), ("alive", "חי / בחיים"), ("almost", "כמעט"), ("alone", "לבד"),
            ("alternate", "לסירוגין / חלופי"), ("altogether", "לחלוטין / סך הכל"), ("ambassador", "שגריר"), ("ambiguous", "מעורפל / דו-משמעי"), ("amount", "כמות / סכום"), ("anger", "כעס / לכעוס"),
            ("angry", "כועס"), ("animal", "חיה / בעל חיים"), ("another", "אחר / נוסף / עוד אחד"), ("answer", "תשובה / לענות"), ("apart", "בנפרד / לחוד"), ("apology", "התנצלות"),
            ("appear", "להופיע / להיראות"), ("appearance", "הופעה / מראה חיצוני"), ("appropriate", "מתאים / הולם"), ("approve", "לאשר / להסכים ל-"), ("architect", "אדריכל"), ("architecture", "אדריכלות"),
            ("area", "אזור / שטח"), ("argue", "להתווכח / לטעון"), ("argument", "טיעון / ויכוח"), ("aristocrat", "אריסטוקרט / בן אצולה"), ("arm", "זרוע / לחמש בנשק"), ("army", "צבא"),
            ("around", "מסביב / בערך"), ("arrange", "לסדר / לארגן"), ("arrest", "לעצור / מעצר"), ("arrive", "להגיע"), ("art", "אמנות"), ("article", "מאמר / כתבה / פריט"),
            ("articulate", "רהוט / להביע ברור"), ("artist", "אמן"), ("artistic", "אמנותי"), ("as far as", "במידת ה- / ככל ש-"), ("as proof of", "כהוכחה ל-"), ("ask", "לבקש / לשאול"),
            ("asked for", "ביקש / דרש"), ("associate", "לקשר / לשייך"), ("association", "איגוד / אסוציאציה"), ("assume", "להניח / לשער"), ("assumption", "הנחה / משער"), ("at least", "לכל הפחות / לפחות"),
            ("athlete", "ספורטאי / אתלט"), ("attach", "לצרף / לחבר"), ("attack", "להתקיף / התקפה"), ("attempt", "לנסות / ניסיון"), ("attitude", "גישה / יחס"), ("attract", "למשוך / למגנט"),
            ("attraction", "אטרקציה / משיכה"), ("attractive", "מושך / אטרקטיבי"), ("audience", "קהל צופים"), ("authentic", "אותנטי / מקורי"), ("availability", "זמינות"), ("available", "זמין"),
            ("average", "ממוצע"), ("avoid", "להימנע מ-"), ("awake", "ער / להתעורר"), ("bacteria", "חיידקים"), ("badly", "קשות / בצורה רעה"), ("baker", "אופה"),
            ("band", "להקה / רצועה"), ("barely", "בקושי"), ("base", "בסיס / לבסס"), ("bat", "עטלף / מחבט"), ("bath", "אמבטיה / לרחוץ"), ("battle", "קרב / להילחם"),
            ("beach", "חוף ים"), ("bear", "דוב / לשאת / לסבול"), ("beauty", "יופי"), ("bedroom", "חדר שינה"), ("begin/an/un", "להתחיל (began/begun)"), ("beginning", "התחלה"),
            ("belong", "שייך ל-"), ("best", "הכי טוב / מיטב"), ("best-seller", "רב-מכר"), ("better", "טוב יותר"), ("bicycle", "אופניים"), ("birth", "לידה"),
            ("bite", "לנשוך / נשיכה"), ("bizarre", "מוזר / חריג"), ("blind", "עיוור"), ("block", "מחסום / לחסום / גוש"), ("blood", "דם"), ("blood vessel", "כלי דם"),
            ("blow, blew", "לנשוף / מכה / לנשב"), ("boat", "סירה"), ("body", "גוף"), ("bone", "עצם"), ("border", "גבול / לתחום"), ("boring", "משעמם"),
            ("bottle", "בקבוק"), ("bottom", "תחתית / קרקעית / חלק תחתון"), ("bought", "קנה (עבר של buy)"), ("brain", "מוח"), ("brainwash", "שטיפת מוח"), ("brave", "אמיץ"),
            ("bread", "לחם"), ("break", "לשבור / הפסקה"), ("breathe", "לנשום"), ("bridge", "גשר"), ("broad", "רחב / מקיף"), ("budget", "תקציב"),
            ("build", "לבנות / מבנה גוף"), ("building", "בניין / מבנה"), ("built", "בנה / בנוי"), ("bullet", "קליע / כדור רובה"), ("by", "על ידי / ליד / עד זמן מסוים"), ("call", "להתקשר / לקרוא / שיחה"),
            ("camera", "מצלמה"), ("care", "דאגה / לאכפת / טיפול"), ("carefully", "בזהירות / בתשומת לב"), ("careless", "רשלני / לא זהיר"), ("carry", "לשאת / לסחוב"), ("catalogue", "קטלוג"),
            ("catch, caught", "לתפוס (caught)"), ("cause", "סיבה / לגרום ל-"), ("cell", "תא (בגוף/כלא/טלפון)"), ("center", "מרכז"), ("central", "מרכזי"), ("challenge", "אתגר / לאתגר"),
            ("chance", "סיכוי / הזדמנות / מקריות"), ("change", "שינוי / לשנות / עודף כסף"), ("characterize", "לאפיין"), ("cheap", "זול"), ("check", "לבדוק / בדיקה / צ'ק"), ("child", "ילד"),
            ("childhood", "ילדות"), ("children", "ילדים"), ("circle", "עיגול / להקיף בעיגול"), ("clean", "נקי / לנקות"), ("clever", "חכם / פיקח"), ("climb", "לטפס / טיפוס"),
            ("clock", "שעון קיר"), ("close", "לסגור / קרוב"), ("cloth", "בד / מטלית"), ("coach", "מאמן / כרכרה"), ("code", "קוד"), ("coexist", "לחיות בדו-קיום"),
            ("coin", "מטבע"), ("cold", "קר / צינון"), ("colonial", "קולוניאלי"), ("color", "צבע / לצבוע"), ("complain", "להתלונן"), ("complete", "שלם / להשלים / לסיים"),
            ("consist", "להיות מורכב מ-"), ("contact", "קשר / ליצור קשר"), ("continue", "להמשיך"), ("continuity", "המשכיות / רצף"), ("continuous", "רציף / מתמשך"), ("control", "שליטה / לשלוט"),
            ("cool", "קריר / קול ומגניב"), ("copies", "עותקים"), ("copy", "עותק / להעתיק"), ("corner", "פינה"), ("correct", "נכון / לתקן"), ("cost", "עלות / לעלות מחיר"),
            ("costly", "יקר ערך / יקר"), ("count", "לספור / להחשיב"), ("country", "מדינה / אזור כפרי"), ("cover", "לכסות / כיסוי / עטיפה"), ("cow", "פרה"), ("culture", "תרבות"),
            ("dance", "לרקוד / ריקוד"), ("danger", "סכנה"), ("dangerous", "מסוכן"), ("daughter", "בת (של ההורים)"), ("death", "מוות"), ("deep", "עמוק"),
            ("deeply", "עמוקות"), ("define", "להגדיר"), ("definite", "החלטי / מוגדר / ברור"), ("delete", "למחוק"), ("desert", "מדבר / לנטוש"), ("devastate", "להחריב / להרוס לחלוטין"),
            ("die", "למות"), ("die (dice)", "קובית משחק"), ("difficult", "קשה / מורכב"), ("dirty", "מלוכלך"), ("diverse", "מגוון / שונה"), ("done", "עשוי / גמור"),
            ("dream", "חלום / לחלום"), ("drink", "לשתות / משקה"), ("drug", "תרופה / סם"), ("due", "חבוי / צפוי / עקב (due to)"), ("early", "מוקדם"), ("earth", "אדמה / עפר"),
            ("Earth", "כדור הארץ"), ("earthquake", "רעידת אדמה"), ("educate", "לחנך"), ("education", "חינוך"), ("empty", "ריק / לרוקן"), ("enemy", "אויב"),
            ("energy", "אנרגיה / מרץ"), ("enjoy", "ליהנות מ-"), ("enjoyable", "מהנה / נעים"), ("enter", "להיכנס / להזין נתונים"), ("error", "שגיאה / טעות"), ("escape", "לברוח / בריחה"),
            ("evening", "ערב"), ("event", "אירוע"), ("exact", "מדויק"), ("exactly", "בדיוק"), ("example", "דוגמה"), ("excessive", "מופרז / מוגזם"),
            ("expert", "מומחה"), ("extinct", "נכחד"), ("fact", "עובדה"), ("false", "שקרי / שגויה"), ("farm", "חווה / לטפח משק"), ("farmer", "חקלאי"),
            ("father", "אבא"), ("fear", "פחד / לפחד"), ("feel", "להרגיש / תחושה"), ("feeling", "הרגשה / רגש"), ("few", "מעט (ספיר)"), ("field", "שדה / תחום עיסוק"),
            ("find", "למצוא"), ("findings", "ממצאים (מחקר)"), ("finger", "אצבע ביד"), ("fire", "אש / לירות / לפטר"), ("fix", "לתקן / לקבוע"), ("flower", "פרח"),
            ("forget", "לשכוח"), ("friend", "חבר"), ("friendly", "ידידותי"), ("friendship", "חברות / ידידות"), ("front", "חזית / קדמי"), ("full", "מלא"),
            ("gain", "להרוויח / להשיג / רווח"), ("glad", "שמח / מרוצה"), ("gradual", "הדרגתי"), ("great", "נהדר / גדול"), ("half", "חצי"), ("hand", "יד / למסור"),
            ("hear", "לשמוע"), ("hearsay", "שמועה / משמועה"), ("heat", "חום / לחמם"), ("hero", "גיבור"), ("horse", "סוס"), ("hot", "חם / חריף / לוהט"),
            ("house", "בית / לאחסן / לשכן"), ("impartial", "בלתי משוחד / ניטרלי"), ("inconsistent", "לא עקבי / סותר"), ("insert", "להכניס / להחדיר"), ("jump", "לקפוץ / קפיצה"), ("just", "רק / צודק / כרגע"),
            ("kill", "להרוג"), ("king", "מלך"), ("kingdom", "ממלכה"), ("kitchen", "מטבח"), ("last", "אחרון / להחזיק מעמד"), ("late", "מאוחר / המנוח"),
            ("light", "אור / קל / להדליק"), ("like", "לאהוב / כמו"), ("list", "רשימה / לרשום"), ("lock", "מנעול / לנעול"), ("logic", "היגיון"), ("main", "עיקרי / מרכזי"),
            ("map", "מפה / למפות"), ("mark", "סימן / ציון / לסמן"), ("maybe", "אולי"), ("meeting", "פגישה / אסיפה"), ("member", "חבר בארגון"), ("milk", "חלב / לחלוב"),
            ("mistake", "טעות / לטעות"), ("mistaken", "טועה / מוטעה"), ("money", "כסף"), ("move", "לזוז / להניע / צעד"), ("movement", "תנועה / מגמה"), ("must", "חייב / חובה"),
            ("number", "מספר / למספר"), ("once", "פעם אחת / ברגע ש-"), ("open", "פתוח / לפתוח"), ("over", "מעל / נגמר"), ("paragraph", "פסקה"), ("pay", "לשלם / שכר"),
            ("peace", "שלום / שקט"), ("peaceful", "שלו / פסטורלי"), ("pilot", "טייס / ניסיוני"), ("place", "מקום / למקם"), ("plan", "תוכנית / לתכנן"), ("plane", "מטוס / מישור"),
            ("president", "נשיא / יו''ר"), ("price", "מחיר / לתמחר"), ("primary", "ראשוני / יסודי / עיקרי"), ("problem", "בעיה"), ("program", "תוכנית / לתכנת / לו''ז"), ("queen", "מלכה"),
            ("question", "שאלה / לערער / לחקור"), ("quick", "מהיר"), ("rates", "שיעורים / תעריפים / קצבים"), ("rather", "למדי / למעשה"), ("react", "להגיב"), ("region", "אזור / מחוז"),
            ("register", "להירשם / לוג"), ("registration", "הרשמה"), ("reject", "לדחות / לפסול"), ("rest", "מנוחה / לנוח / השאר"), ("rich", "עשיר"), ("right", "ימין / צדק / זכות"),
            ("risk", "סיכון / לסכן"), ("river", "נהר"), ("road", "כביש / דרך"), ("safe", "בתוח / כספת"), ("safety", "בטיחות"), ("save", "להציל / לשמור / לחסוך"),
            ("scare", "להבהיל / פחד"), ("school", "בית ספר / אסכולה"), ("search", "חיפוש / לחפש"), ("select", "לבחור / נבחר"), ("sell", "למכור"), ("send", "לשלוח"),
            ("several", "כמה / אחדים"), ("short", "קצר / נמוך"), ("shortage", "מחסור / גרעון"), ("side", "צד / דופן"), ("sleep", "לישון / להירדם"), ("slow", "איטי"),
            ("slow down", "להאט"), ("so", "אז / כל כך / לכן"), ("space", "חלל / מרחב / לרווח"), ("speed", "מהירות / למהר"), ("start", "להתחיל / זינוק"), ("still", "עדיין / שקט"),
            ("stone", "אבן"), ("strong", "חזק"), ("stronghold", "מעוז / מבצר"), ("system", "מערכת / שיטה / מנגנון"), ("target", "מטרה / יעד / לכוון"), ("teach, taught", "ללמד (taught)"),
            ("think, thought", "לחשוב / מחשבה (thought)"), ("time", "זמן / פעם / לתזמן"), ("totally", "לחלוטין / לגמרי"), ("town", "עיירה / עיר קטנה"), ("understand", "להבין"), ("unusual", "חריג / בלתי רגיל"),
            ("use", "להשתמש / שימוש / תועלת"), ("useful", "שימושי / יעיל"), ("useless", "חסר תועלת"), ("usual", "רגיל / סטנדרטי"), ("valuable", "יקר ערך"), ("value", "ערך / להעריך"),
            ("view", "נוף / השקפה / לראות"), ("viewer", "צופה במסך"), ("visit", "לבקר / ביקור"), ("visitor", "אורח / מבקר"), ("voice", "קול (דיבור)"), ("wait", "לחכות / המתנה"),
            ("way", "דרך / אופן / נתיב"), ("weather", "מזג אוויר")
        ]
        for e, h in w2: db.session.add(Word(unit_id=2, english=e, hebrew=h))
        db.session.commit()

    # --- יחידה 3 ---
    u3 = Unit.query.get(3)
    if not u3:
        u3 = Unit(id=3, name="יחידה 3: אוצר מילים מתקדמת ואקדמית")
        db.session.add(u3)
        db.session.commit()
        w3 = [
            ("abrupt", "פתאומי / מפתיע"), ("absolute", "מוחלט / גמור"), ("accessible", "נגיש / זמין"), ("accomplish", "להשיג / לבצע"), ("accomplished", "מושלם / בעל הישגים"), ("accomplishment", "הישג"),
            ("account", "חשבון / דיווח / להחשיב"), ("accuracy", "דיוק"), ("accurate", "מדויק"), ("activist", "אקטיביסט / פעיל"), ("adapt", "להתאים / להסתגל / לעבד"), ("administer", "לנהל / לתת תרופה"),
            ("administration", "מנהל / הממשל"), ("admit", "להודות / לאפשר כניסה"), ("adult", "מבוגר"), ("adulthood", "בגרות"), ("advance", "להתקדם / מקדמה"), ("advancement", "התקדמות / קידום"),
            ("advantage", "יתרון"), ("advice", "עצה"), ("advise", "לייעץ"), ("advisor", "יועץ"), ("aesthetic", "אסתטי / יפה"), ("allocate", "להקצות / להקציב"),
            ("announcement", "הודעה / הכרזה"), ("annually", "מדי שנה"), ("appoint", "למנות לתפקיד"), ("approach", "גישה / להתקרב"), ("approximately", "בערך / בקירוב"), ("astronomy", "אסטרונומיה"),
            ("attention", "תשומת לב"), ("attribute", "תכונה / לייחס ל-"), ("aware", "מודע"), ("balance", "איזון / יתרה בחשבון"), ("ban", "חרם / לאסור"), ("belief", "אמונה"),
            ("bend", "לכופף / להתכופף"), ("beware", "להיזהר"), ("borrow", "לשאול / להלוות"), ("brief", "קצר / תמציתי"), ("briefly", "בקיצור / בקצרה"), ("bright", "בהיר / חכם"),
            ("by no means", "בשום אופן לא"), ("by now", "כבר עכשיו / עד עכשיו"), ("capable", "מסוגל / מוכשר"), ("capacity", "קיבולת / יכולת / תפקיד"), ("capital", "עיר בירה / הון / אות גדולה"), ("capital punishment", "עונש מוות"),
            ("capitalize", "להפיק תועלת / לכתוב באות גדולה"), ("certain", "בטוח / ודאי / מסוים"), ("certainty", "ודאות"), ("character", "אופי / דמות / אות תו"), ("characteristic", "מאפיין / אופייני"), ("choice", "בחירה"),
            ("choose", "לבחור"), ("circumstance", "נסיבה / תנאי"), ("civil", "אזרחי / מנומס"), ("class", "מעמד / כיתה / סוג"), ("classify", "לסווג"), ("colony", "מושבה"),
            ("combine", "לשלב / לאחד"), ("common", "משותף / נפוץ"), ("communal", "שיתופי / קהילתי"), ("communicate", "לתקשר"), ("community", "קהילה"), ("company", "חברה עסקית / חברה אנשים"),
            ("comparable", "בר השוואה / דומה"), ("compare", "להשוות"), ("comparison", "השוואה"), ("comprehend", "להבין / לתפוס"), ("comprehension", "הבנה"), ("concentrate", "להתרכז / לרכז"),
            ("conclude", "להסיק / לסיים / לסכם"), ("conclusion", "מסקנה / סיום"), ("conclusively", "באופן חד משמעי"), ("confirm", "לאשר / לאמת"), ("continuation", "המשך"), ("cooperation", "שיתוף פעולה"),
            ("core", "ליבה / מרכז"), ("crisis", "משבר"), ("cure", "ריפוי / תרופה"), ("decide", "להחליט"), ("decline", "להידרדר / ירידה / לסרב"), ("decrease", "להפחית / הפחתה / צמצום"),
            ("deduce", "להסיק (מסקנה)"), ("demand", "דרישה / לדרוש / ביקוש"), ("deny", "להכחיש / למנוע / לסרב"), ("depart", "לעזוב / לצאת לדרך"), ("derive", "להפיק / לנבוע מ-"), ("descend", "לרדת / לשקוע"),
            ("descendent", "צאצא"), ("deserve", "להיות ראוי ל-"), ("destiny", "גורל"), ("devote", "להקדיש זמן"), ("direct", "ישיר / לכוון / לביים"), ("direction", "כיוון / הנחיה"),
            ("disadvantage", "חיסרון"), ("disclose", "לחשוף / לגלות"), ("discover", "לגלות"), ("discoveries", "תגליות"), ("discuss", "לדון / לשוחח"), ("disprove", "להפריך / להוכיח שאינו נכון"),
            ("distinct", "מובחן / ברור / נפרד"), ("distress", "מצוקה / סבל"), ("diverge", "להתפצל / לסטות"), ("diversity", "גיוון / שוני"), ("divide", "לחלק / לפצל"), ("doubt", "ספק / להטיל ספק"),
            ("edit", "לערוך"), ("edition", "מהדורה"), ("editor", "עורך"), ("emperor", "קיסר"), ("empire", "אימפריה"), ("enable", "לאפשר"),
            ("enormous", "עצום / ענק"), ("enough", "מספיק"), ("era", "עידן / תקופה"), ("essential", "חיוני / מהותי"), ("evaluate", "להעריך"), ("evaluation", "הערכה"),
            ("even", "אפילו / זוגי / יציב"), ("evenly", "באופן שווה / חלקה"), ("except for", "מלבד / חוץ מ-"), ("exercise", "תרגיל / להתעמל / להפעיל סמכות"), ("expect", "לצפות ל-"), ("expectations", "ציפיות"),
            ("explain", "להסביר"), ("explanation", "הסבר"), ("express", "להביע / מהיר"), ("expression", "ביטוי / הבעה"), ("extreme", "קיצוני"), ("face", "פנים / להתמודד"),
            ("facial", "של הפנים"), ("financial", "פיננסי / כספי"), ("forbid", "לאסור"), ("form", "צורה / טופס / ליצור / סוג"), ("formal", "רשמי"), ("forth", "הלאה / קדימה"),
            ("general", "כללי / גנרל"), ("generally", "בדרך כלל"), ("gross", "גס / מגעיל / ברוטו"), ("growth", "צמיחה / גידול"), ("habit", "הרגיל / מנהג"), ("habitat", "סביבת מחיה טבעית"),
            ("health", "בריאות"), ("heavily", "בכבדות / קשות"), ("heavy", "כבד"), ("hope", "תקווה / לקוות"), ("human", "אנושי / בן אדם"), ("identical", "זהה לחלוטין"),
            ("implicate", "לערב / לסבך בפשע"), ("implications", "השלכות"), ("importance", "חשיבות"), ("important", "חשוב"), ("inadequate", "בלתי מספיק / לא הולם"), ("income", "הכנסה כספית"),
            ("incomprehensible", "בלתי מובן"), ("indicate", "להצביע על / להראות"), ("indication", "אינדיקציה / סימן"), ("inhabit", "לאכלס / לגור ב-"), ("inhabitants", "תושבים"), ("initial", "ראשוני / אות ראשונה"),
            ("initiated", "יזם / התחיל"), ("international", "בינלאומי"), ("island", "אי"), ("isle", "אי קטן"), ("issue", "נושא / להנפיק / גיליון עיתון"), ("jewel", "תכשיט / אבן חן"),
            ("join", "להצטרף / לחבר"), ("joint", "משותף / מפרק בגוף"), ("judge", "שופט / לשפוט"), ("lack", "מחסור / חוסר"), ("language", "שפה"), ("large", "גדול / רחב"),
            ("largest", "הכי גדול"), ("law", "חוק / משפט"), ("lawyer", "עורך דין"), ("legal", "חוקי / משפטי"), ("legalize", "להפוך לחוקי / לגליזציה"), ("less", "פחות"),
            ("lethal", "קטלני / ממית"), ("level", "רמה / לשטח / לפלס"), ("likely", "סביר להניח / צפוי"), ("local", "מקומי"), ("locate", "לאתר / למקם"), ("malfunction", "תקלה / שיבוש"),
            ("massacre", "טבח / לטבוח"), ("medicine", "תרופה / רפואה"), ("medieval", "של ימי הביניים"), ("merchandise", "סחורה"), ("mere", "רק / בלבד / ותו לא"), ("merely", "רק / בלבד"),
            ("middle", "אמצע / מרכז"), ("mortal", "בן תמותה / קטלני"), ("mortality", "תמותה"), ("most", "הכי / הרוב / מרבית"), ("mutually", "באופן הדדי"), ("nation", "אומה / מדינה"),
            ("nationality", "לאום / אזרחות"), ("nationalize", "להפוך ללאומי"), ("native", "בן המקום / יליד"), ("natural", "טבעי"), ("nature", "טבע / אופי המהות"), ("need", "צורך / להזדקק"),
            ("negative", "שלילי / תשליל"), ("network", "רשת"), ("new", "חדש"), ("newscaster", "מגיש חדשות"), ("newspaper", "עיתון"), ("note", "הערה / פתק / לשים לב"),
            ("noted", "מפורסם / ידוע לשבח"), ("obviously", "כמובן / באופן ברור"), ("occasion", "אירוע / הזדמנות"), ("occasional", "מקרי / מדי פעם"), ("occasions", "אירועים / מקרים"), ("occur", "התרחש / קרה"),
            ("offer", "הצעה / להציע"), ("official", "רשמי / פקיד"), ("officiate", "לנהל טקס / לכהן"), ("oil", "שמן / נפט"), ("ongoing", "מתמשך / מתנהל"), ("option", "אפשרות / אופציה"),
            ("order", "סדר / פקודה / להזמין"), ("orderly", "מסודר / מאורגן"), ("orientation", "אוריינטציה / התמצאות"), ("origin", "מקור / מוצא"), ("original", "מקורי / מקור"), ("originality", "מקוריות"),
            ("originate", "לנבוע / להיווצר"), ("outcome", "תוצאה"), ("overcome", "להתגבר על"), ("part", "חלק / להיפרד"), ("partial", "חלקי / משוחד"), ("patient", "סבלני / מטופל חולה"),
            ("per", "לכל / לכל יחידה"), ("percent", "אחוז"), ("perfect", "מושלם / לשכלל"), ("pollution", "זיהום"), ("population", "אוכלוסייה"), ("possess", "להחזיק בבעלותו / לשלוט"),
            ("possession", "רכוש / חזקה"), ("precise", "מדויק"), ("precision", "דיוק רב"), ("presence", "נוכחות"), ("present", "מתנה / הווה / להציג / להעלות"), ("prime", "ראשי / מובחר / ראשוני"),
            ("primitive", "פרימיטיבי / קדום"), ("prior", "קודם / מוקדם"), ("priority", "עדיפות / קדימות"), ("progress", "התקדמות / להתקדם"), ("progressive", "מתקדם"), ("proper", "הולם / תקין"),
            ("properly", "היטב / כמו שצריך"), ("protect", "להגן"), ("provide", "לספק / לפרנס"), ("purpose", "מטרה / תכלית"), ("purposely", "בכוונה"), ("quiet", "שקט / להשקיט"),
            ("quite", "די / לחלוטין"), ("quote", "ציטוט / לצטט"), ("raise", "להרים / לגדל / להעלות שכר"), ("range", "טווח / רכס / מגוון"), ("rational", "רציונלי"), ("rationalize", "להצדיק"),
            ("reality", "מציאות / ריאליטי"), ("reason", "סיבה / היגיון / להסביר"), ("recession", "מיתון כספי"), ("recommend", "להמליץ"), ("recycle", "למחזר"), ("recycling", "מיחזור"),
            ("reduce", "להפחית / לצמצם"), ("refer", "להתייחס / להפנות"), ("reference", "התייחסות / סימוכין"), ("refuse", "לסרב / פסולת אשפה"), ("regime", "משטר / שלטון"), ("regulation", "תקנה / רגולציה"),
            ("reign", "תקופת שלטון / למלוך"), ("reigned", "מלך / שלט"), ("relative", "קרוב משפחה / יחסי"), ("relatively", "יחסית"), ("religion", "דת"), ("repeat", "לחזור על / חזרה"),
            ("repetition", "חזרה / רפיטציה"), ("reply", "תשובה / לענות"), ("research", "מחקר / לחקור"), ("resist", "להתנגד / לעמוד בפני"), ("resistance", "התנגדות"), ("resolve", "לפתור בעיה / נחישות"),
            ("result", "תוצאה / לנבוע מ-"), ("result in", "להסתיים ב- / להוביל ל-"), ("reveal", "לחשוף / לגלות"), ("review", "ביקורת / סקירה / חזרה"), ("rigid", "נוקשה / קשיח"), ("rise", "לעלות / עלייה"),
            ("rising", "עולה / מרד התקוממות"), ("rocket", "רקטה / טיל / לנסוק"), ("scene", "סצנה / זירה / תפאורה"), ("scenery", "נוף / תפאורה"), ("science", "מדע"), ("scientist", "מדען"),
            ("section", "חלק / קטע / סעיף"), ("seem", "להידמות / להיראות ש-"), ("sense", "חוש / תחושה / משמעות"), ("sensible", "נבון / הגיוני"), ("serious", "רציני / חמור"), ("shuttle", "מעבורת / קו הסעות"),
            ("sign", "שלט / סימן / לחתום / אות"), ("signal", "אות / לאותת"), ("similar", "דומה"), ("simple", "פשוט"), ("simplify", "לפשט"), ("simply", "פשוט / בלבד"),
            ("social", "חברתי"), ("spacious", "מרווח / רחב ידיים"), ("square", "ריבוע / כיכר"), ("stand", "לעמוד / עמדה / דוכן"), ("standardize", "לתקנן"), ("subject", "נושא / נתין / נבדק / כפוף"),
            ("subjective", "סובייקטיבי"), ("suburban", "פרברי"), ("succeed", "להצליח"), ("success", "הצלחה"), ("sum", "סכום / סך הכל / לסכם"), ("sum up", "לסכם"),
            ("summarize", "לתמצט / לסכם"), ("summary", "סיכום / תמצית"), ("surround", "להקיף / לכתר"), ("surrounding", "סביבה / מסביב"), ("task", "משימה / מטלה"), ("territory", "טריטוריה / שטח"),
            ("thereby", "ובכך / כתוצאה מכך"), ("title", "כותרת / תואר"), ("touch", "לגעת / מגע / קשר"), ("trade", "מסחר / לסחור / להחליף"), ("train", "רכבת / לאמן / שורה"), ("trial", "משפט / ניסוי / צרות"),
            ("turn", "להסתובב / לפנות / תור"), ("uncharted", "לא ממופה / לא נודע"), ("uniform", "מדים / אחיד קבוע"), ("unify", "לאחד / ללכד"), ("union", "איחוד / איגוד מקצועי"), ("universe", "יקום / תבל"),
            ("uphold", "לתמוך / לשמור על"), ("volume", "נפח / עוצמת קול / כרך / כמות"), ("war", "מלחמה"), ("warfare", "לוחמה"), ("warrior", "לוחם"), ("waste", "פסולת / לבזבז / שממה"),
            ("watch", "לצפות / לשמור / שעון יד / משמרת"), ("widespread", "נפוץ / רחב ממדים"), ("wild", "פראי / בר"), ("wilderness", "אזור שממה / פרא"), ("wool", "צמר")
        ]
        for e, h in w3: db.session.add(Word(unit_id=3, english=e, hebrew=h))
        db.session.commit()

    # --- יחידה 4 ---
    u4 = Unit.query.get(4)
    if not u4:
        u4 = Unit(id=4, name="יחידה 4: אוצר מילים מורחב וביטויים נפוצים")
        db.session.add(u4)
        db.session.commit()
        w4 = [
            ("abandon", "לנטוש / לעזוב לחלוטין"), ("abduct", "לחטוף (אדם)"), ("abide", "לציית / לשכון / לסבול"), ("absence", "היעדרות / חוסר"), ("absent", "נעדר / לא נמצא"), ("absorb", "לספוג / לקלוט"),
            ("abundance", "שפע / רוב"), ("abuse", "התעללות / שימוש לרעה / להתעלל"), ("accumulate", "לצבור / לאגור"), ("acquire", "לרכוש / להשיג"), ("acquisition", "רכישה / נכס"), ("adopt", "לאמץ (ילד/רעיון)"),
            ("adventure", "הרפתקה"), ("affect", "להשפיע על"), ("affection", "חיבה / אהבה"), ("affluence", "שפע / עושר"), ("fluent", "עשיר / בעל שפע"), ("aid", "עזרה / סיוע / לסייע"),
            ("airborne", "מוטס / נישא באוויר"), ("airline", "חברת תעופה"), ("airplane", "מטוס"), ("alike", "דומה / באותו אופן"), ("allow", "להרשות / לאפשר"), ("ally (allies)", "בעל ברית / בריתות"),
            ("alter", "לשנות / לתקן"), ("alterations", "שינויים / תיקונים"), ("alternately", "לסירוגין"), ("amateur", "חובבן / לא מקצועי"), ("amend", "לתקן / לשפר (חוק)"), ("analyze", "לנתח (נתונים/מצב)"),
            ("anticipate", "לצפות מראש"), ("anxious", "חרד / להוט משתוקק"), ("apparent", "גלוי לעין / לכאורה"), ("apparently", "ככל הנראה"), ("apply", "ליישם / להחיל / להגיש מועמדות"), ("appreciate", "להעריך / להוקיר"),
            ("appreciation", "הערכה / הוקרה"), ("appropriately", "כראוי / בהתאם"), ("arise", "להתעורר / לנבוע מ-"), ("arise, arose", "קם / נוצר (עבר: arose)"), ("artificial", "מלאכותי"), ("aside", "הצידה / מלבד (aside from)"),
            ("assess", "להעריך (שווי/נזק)"), ("asset", "נכס / קניין"), ("assign", "להקצות / להטיל משימה"), ("assignment", "משימה / מטלה"), ("attain", "להשיג / להגיע ל-"), ("attend", "נוכח / להשתתף / לטפל ב-"),
            ("attendant", "מלווה / סדרן / דייל"), ("authority", "סמכות / רשות"), ("authorize", "להסמיך / לאשר"), ("autumn", "סתיו"), ("await", "לחכות ל- / לצפות"), ("awareness", "מודעות"),
            ("bare", "חשוף / עירום / פשוט"), ("behave", "להתנהג"), ("behavior", "התנהגות"), ("bounce", "לקפץ / לחזור / החזרה"), ("brilliant", "מבריק / גאוני"), ("burden", "נטל / משא / להעמיס"),
            ("bush", "שיח / סבך"), ("cable", "כבל / מברק"), ("calculate", "לחשב"), ("calculator", "מחשבון"), ("campaign", "קמפיין / מערכה"), ("candid", "גלוי לב / ישר / כנה"),
            ("candidate", "מועמד"), ("case", "מקרה / תיק / קופסה נרתיק"), ("categorize", "לסווג לקטגוריות"), ("cautious", "זהיר"), ("century", "מאה (100 שנה)"), ("charge", "מחיר / לטעון / להאשים / פיקוח אחריות / להסתער / מטען"),
            ("chart", "תעודה / מפה / תרשים"), ("claim", "טענה / לטעון / תביעה / לדרוש בעלות"), ("coincide", "להתלכד / להתרחש באותו זמן"), ("colossal", "עצום / כביר"), ("commence", "להתחיל"), ("compress", "לדחוס / לכווץ"),
            ("comprise", "להכיל / לכלול"), ("concept", "מושג / קונספט"), ("conception", "תפיסה / מושג / התעברות"), ("confer", "להעניק / להתייעץ"), ("conference", "ועידה / כנס"), ("confide", "לספר בסוד / לבטוח"),
            ("confident", "בטוח בעצמו"), ("conflict", "עימות / סכסוך / להתנגש"), ("conjecture", "השערה / לנחש"), ("connect", "לחבר / לקשר"), ("consequence", "תוצאה / השלכה"), ("consider", "לשקול / להתחשב / להחשיב"),
            ("considerable", "ניכר / משמעותי"), ("consume", "לצרוך / לעכל / לכלות"), ("consumers", "צרכנים"), ("contain", "להכיל / לכלול"), ("contemporary", "בן זמננו / עכשווי"), ("convenient", "נוח"),
            ("conveniently", "בנוחות"), ("convention", "מוסכמה / ועידה / אמנה"), ("conventional", "קונבנציונלי / שגרתי"), ("convert", "להמיר / לשנות / להמיר דת"), ("convey", "להעביר (מסר/מטען)"), ("courageous", "אמיץ / נועז"),
            ("create", "ליצור"), ("creator", "יוצר / בורא"), ("creature", "יצור / בריאה"), ("currency", "מטבע"), ("custom", "מנהג / מכס (customs)"), ("customer", "לקוח"),
            ("customize", "להתאים אישית"), ("damage", "נזק / להזיק"), ("decade", "עשור (10 שנים)"), ("defeat", "תבוסה / להביס"), ("defeated", "מובס / מיואש"), ("defend", "להגן על"),
            ("defense", "הגנה / סנגוריה"), ("deficiency", "מחסור / ליקוי"), ("deliver", "למסור / להוביל משלוח / ליילד"), ("delivery", "משלוח / לידה"), ("demographic", "דמוגרפי"), ("demonstrate", "להדגים / להוכיח / להפגני"),
            ("destination", "יעד"), ("detach", "לנתק / להפריד"), ("deteriorate", "להידרדר / להחמיר"), ("diagnose", "לאבחן"), ("director", "מנהל / במאי / חבר דירקטוריון"), ("discriminate", "להפלות / להבחין בין"),
            ("dismiss", "לפטר / לפזר / לבטל"), ("disposable", "חד-פעמי / זמין לשימוש"), ("disrupt", "לשבש / להפריע"), ("distribute", "לחלק / להפיץ"), ("distribution", "הפצה / חלוקה"), ("document", "מסמך / לתעד"),
            ("duty", "חובה / תפקיד / מכס"), ("earn", "להרוויח בזכות / להשתכר"), ("economy", "כלכלה / חיסכון"), ("edge", "קצה / להב / יתרון"), ("elaborate", "להרחיב / לפרט / מורכב"), ("elect", "לבחור / נבחר"),
            ("emerge", "להגיח / להתגלות"), ("emigrate", "להגר החוצה"), ("eminent", "דגול / בולט"), ("enclose", "לצרף / להקיף"), ("enlarge", "להגדיל / להרחיב"), ("ensure", "להבטיח / לוודא"),
            ("environment", "סביבה"), ("epidemic", "מגיפה"), ("equivalent", "שווה ערך / מקביל"), ("erase", "למחוק"), ("eraser", "מחק"), ("establish", "להקים / לייסד / לבסס"),
            ("estimate", "הערכה / להעריך"), ("ethical", "אתי / מוסרי"), ("evade", "להתחמק / להשתמט"), ("evidence", "ראיות / עדות"), ("exception", "חריג / יוצא מן הכלל"), ("execute", "להוציא לפועל / להוציא להורג"),
            ("facility", "מתקן / מבנה / מיומנות"), ("fail", "להיכשל"), ("failure", "כישלון"), ("faith", "אמונה / נאמנות"), ("fall", "ליפול / נפילה / סתיו"), ("feature", "מאפיין / טור קבוע / להציג כפיצ'ר"),
            ("flourish", "לשגשג / לפרוח"), ("follow", "לעקוב / לבוא אחרי / לציית"), ("for the sake of", "למען / בשביל"), ("force", "כוח / לאלץ"), ("forsake", "לנטוש / לעזוב לחלוטין"), ("found", "מצא / לייסד להקים"),
            ("foundation", "יסוד / קרן / בסיס"), ("function", "תפקוד / פונקציה"), ("future", "עתיד"), ("gather", "לאסוף / לקבץ / להבין"), ("global", "עולמי / גלובלי"), ("goal", "מטרה / יעד"),
            ("goods", "סחורות"), ("grasp", "לתפוס לאחוז / תפיסה הבנה"), ("group", "קבוצה / לקבץ"), ("hardly", "בקושי / כמעט שלא"), ("hesitate", "להסס"), ("hold back", "לעצור / לרסן / לעכב"),
            ("homeland", "מולדת"), ("honest", "ישר / כנה"), ("honor", "כבוד / לכבד"), ("huge", "עצום / ענק"), ("idea", "רעיון / מושג"), ("identify", "לזהות / להזדהות"),
            ("illegal", "בלתי חוקי"), ("image", "תמונה / בבואה / תדמית"), ("imagination", "דמיון"), ("imagine", "לדמיין / לשער"), ("impair", "לפגום / להחליש"), ("impart", "להעניק / להקנות"),
            ("impartially", "ללא משוא פנים"), ("import", "יבוא / לייבא / חשיבות"), ("impose", "לכפות / להטיל מס"), ("impossible", "בלתי אפשרי"), ("imprisoned", "כלוא / אסור"), ("improve", "לשפר / להשתפר"),
            ("improvise", "לאלתר"), ("in order", "תקין / סדר / כדי ל- (in order to)"), ("increase", "להגדיל / הגדלה / עלייה"), ("incredible", "לא יאומן / מדהים"), ("individual", "פרט / אינדיבידואל"), ("industry", "תעשייה / חרוצות"),
            ("inferred", "הסיק / מוסק"), ("inform", "ליידע / לעדכן"), ("information", "מידע"), ("innovate", "לחדש / להמציא"), ("intention", "כוונה"), ("intentional", "מכוון / בזדון"),
            ("interact", "לתקשר / להשפיע זה על זה"), ("interest", "עניין / ריבית / אינטרס טובת"), ("internal", "פנימי"), ("interpretation", "פרשנות / פירוש"), ("involve", "לערב / לכלול"), ("isolate", "לבודד"),
            ("judgment", "שיפוט / פסק דין"), ("know, knew", "לדעת (knew/known)"), ("knowledge", "ידע"), ("known", "ידוע / מוכר"), ("laid", "הניח / הטיל (עבר של lay)"), ("lane", "נתיב / סמטה"),
            ("launch", "להשיק / לשגר / השקה / סירת מנוע"), ("limit", "גבול / להגביל / מגבלה"), ("limitation", "מגבלה"), ("lobby", "מבואה / לובי / ללחוץ לקדם אינטרסים"), ("mammal", "יונק"), ("moderate", "מתון / למתן / להנחות דיון"),
            ("modernize", "לחדש / להפוך למודרני"), ("mold", "עובש / תבנית / לעצב בתבנית"), ("motivate", "להניע / לעורר מוטיבציה"), ("negate", "לשלול / לבטל"), ("neutral", "ניטרלי"), ("numerous", "רבים / מספר גדול של"),
            ("nutrition", "תזונה"), ("object", "חפץ עצם מטרה / להתנגד"), ("obtain", "להשיג / לקבל"), ("operate", "להפעיל / לנתח רפואית"), ("operation", "פעולה מבצע / ניתוח"), ("opposition", "התנגדות / אופוזיציה"),
            ("ordinary", "רגיל / פשוט / שגרתי"), ("organ", "איבר בגוף / עוגב"), ("organization", "ארגון"), ("organize", "לארגן / לסדר"), ("outbreak", "התפרצות מחלה"), ("overdo", "להגזים / לעשות יותר מדי"),
            ("overdue", "באיחור / שעבר זמנו"), ("pace", "קצב / פסיעה"), ("pair", "זוג / לצמד"), ("parent", "הורה"), ("parenting", "הורות / גידול ילדים"), ("participate", "להשתתף ב-"),
            ("particular", "מסוים / ספציפי / קפדן"), ("particulars", "פרטים מלאים"), ("pause", "הפסקה / לעצור זמנית"), ("persist", "להתמיד / להתעקש"), ("person", "אדם / אישיות"), ("personal", "אישי / פרטי"),
            ("personality", "אישיות / אופי"), ("phase", "שלב / פאזה / תקופה"), ("phenomenon", "תופעה"), ("pioneer", "חלוץ / ראשון בתחום"), ("position", "עמדה תנוחה תפקיד / מיקום / דעה תפיסה"), ("possible", "אפשרי"),
            ("poverty", "עוני"), ("poverty-stricken", "מוכה עוני / עני מרוד"), ("precedent", "תקדים"), ("preceding", "הקודם / שבא לפני"), ("predecessors", "קודמים בתפקיד / אבות"), ("predestined", "נקבע מראש"),
            ("predict", "לחזות / לנבא"), ("prediction", "תחזית / ניבוי"), ("predictive", "חיזוי / בעל יכולת ניבוי"), ("premature", "לפני הזמן / פג"), ("private", "פרטי / טוראי"), ("produce", "לייצר / להפיק / תוצרת חקלאית"),
            ("product", "מוצר / תוצר"), ("profession", "מקצוע"), ("professional", "מקצועי"), ("profound", "עמוק / מעמיק / מוחלט נחרץ"), ("profoundly", "עמוקות / בצורה מוחלטת"), ("promise", "הבטחה / להבטיח"),
            ("property", "רכוש נכס / תכונה מאפיין"), ("protest", "מחאה / למחות"), ("prove", "להוכיח / להתברר כ-"), ("public", "ציבור / ציבורי / פומבי"), ("race", "מרוץ / לרוץ מהר / גזע מוצא"), ("rail", "מעקה / מסילה"),
            ("railroad", "מסילת רכבת"), ("random", "אקראי"), ("randomly", "באופן אקראי"), ("reaction", "תגובה / ריאקציה"), ("reasonable", "סביר / הגיוני"), ("reconstruct", "לשחזר / לבנות מחדש"),
            ("refute", "להפריך / לסתור"), ("regain", "להשיג בחזרה"), ("regard", "להביט / להחשיב / כבוד"), ("relate", "לקשר / להתייחס / לספר"), ("release", "לשחרר / שחרור / פרסום"), ("relevant", "רלוונטי"),
            ("relocate", "לשנות מיקום / לעבור"), ("reluctant", "מסתייג / לא שש"), ("rely", "להסתמך על / לבטוח"), ("remote", "רחוק / מבודד / שלט רחוק"), ("report", "דיווח / דוח / לדווח"), ("reporter", "כתב / עיתונאי"),
            ("request", "בקשה / לבקש"), ("require", "לדרוש / להצריך"), ("restore", "לשחזר / להחזיר מצב"), ("resume", "לחדש / להמשיך"), ("resumption", "חידוש / המשך"), ("rule", "חוק כלל לשלוט / פסק דין"),
            ("ruler", "סרגל / שליט"), ("season", "עונה / לתבל / להרגיל"), ("secure", "מאובטח / להבטיח / להשיג"), ("selective", "סלקטיבי / בררני"), ("service", "שירות / לשרת"), ("share", "לחלוק / שותף / מניה / נתח"),
            ("ship", "אונייה / לשלוח סחורה"), ("shipment", "משלוח / מטען"), ("significance", "חשיבות / משמעות"), ("significant", "משמעותי / חשוב"), ("simulate", "לדמות / לעשות סימולציה"), ("size", "גודל / לדרג לפי גודל"),
            ("soar", "לנסוק / להמריא פלאים"), ("soil", "אדמה / ללכלך"), ("solicit", "לשדל / להפציר / לפתות"), ("solitude", "בדידות (מבחירה)"), ("solution", "פתרון / תמיסה"), ("sort", "סוג / למיין"),
            ("source", "מקור"), ("span", "משך / מרווח / טווח"), ("splendid", "מצוין / מפואר"), ("spring", "קפיץ / מעיין / אביב / לקפוץ"), ("spring, sprang", "נבע / זינק (sprang)"), ("stability", "יציבות"),
            ("stamina", "כוח עמידה / סיבולת"), ("standard", "תקן / סטנדרט"), ("state", "מדינה / מצב / להצהיר לנסח"), ("statement", "הצהרה / טענה / תדפיס"), ("steady", "יציב / קבוע"), ("stimulate", "לגרות / לעורר / לתמרץ"),
            ("stock", "מלאי / מניות / ציר מרק"), ("strange", "מוזר / זר"), ("strive", "לשאוף / לחתור בתוקף"), ("successor", "יורש / ממשיך דרך"), ("summer", "קיץ"), ("superior", "עליון / נעלה / מנהל ישיר"),
            ("supervise", "לפקח / להשגיח"), ("support", "תמיכה / לתמוך / לכלכל"), ("supportive", "תומך"), ("survey", "סקר / לסקור / מדידת שטח"), ("survive", "לשרוד"), ("swift", "מהיר / זריז"),
            ("temporary", "זמני"), ("thick", "עבה / סמיך / צפוף"), ("thrive", "לשגשג / להצליח"), ("tradition", "מסורת"), ("traffic", "תנועה בכביש / סחר לא חוקי"), ("traffic jam", "פקק תנועה"),
            ("transfer", "העברה / להעביר / כרטיס מעבר"), ("tribe", "שבט"), ("unaware", "לא מודע ל-"), ("uncertain", "לא בטוח / מוטל בספק"), ("unclear", "לא ברור"), ("uncover", "לחשוף / לגלות"),
            ("unfold", "לפרוש / לפתח / להתגלות"), ("unit", "יחידה / תא"), ("unstable", "לא יציב"), ("update", "עדכון / לעדכן"), ("upgrade", "שדרוג / לשדרג"), ("valid", "תקף / חוקי / הגיוני"),
            ("validate", "לתת תוקף / לאשר"), ("violence", "אלימות"), ("violent", "אלים"), ("widely", "במידה רבה / באופן נרחב"), ("widen", "להרחיב"), ("winter", "חורף")
        ]
        for e, h in w4: db.session.add(Word(unit_id=4, english=e, hebrew=h))
        db.session.commit()
        print("🎉 כל 4 היחידות הוזרקו במלואן למסד הנתונים!")
# הרצה אוטומטית שחלה גם ב-Render (Gunicorn)
with app.app_context():
    db.create_all()
    seed_data()

# הרצה מקומית בלבד למחשב שלך
if __name__ == '__main__':
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)