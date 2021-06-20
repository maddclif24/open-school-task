import Express from 'express';
import morgan from 'morgan';
import News from './utils/News.js';
import MongoClient from 'mongodb';
import encrypt from './utils/encrypt.js';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import dotenv from 'dotenv';

dotenv.config();

const app = new Express();
const logger = morgan('combined');

const uri = `mongodb+srv://maddclif:${process.env.DATABASE_PASSWORD}@cluster0.andql.mongodb.net/open_class_task?retryWrites=true&w=majority`;

app.use(logger);
app.use(Express.urlencoded({ extended: true }));
app.set('view engine', 'pug');
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
    store: MongoStore.create({ mongoUrl: uri })
}));

MongoClient.connect(uri, { useNewUrlParser: true, useUnifiedTopology: true }).then((client) => {
    const db = client.db("open_class_task");

    const getLogin = async (userId) => {
        const collectionUsers = await db.collection("users");
        const currentUser = await collectionUsers.findOne({ _id: MongoClient.ObjectId(userId) });
        return `Current user - ${currentUser.login}`;
    };

    app.get('/', (req, res) => {
        res.render('main');
    });
    
    app.route('/reg')
        .get((req, res) => {
            res.render('reg');
        })
        .post(async (req, res) => {
            const collection = await db.collection("users");
            const { login, email, password } = req.body;
            const [hashPassword, salt] = encrypt(password);
            try {
                await collection.insertOne({ login, email, password: hashPassword, salt });
                res.redirect('/auth');
            } catch (error) {
                const [context, value] = error.keyValue.login ? ['login', login] : ['email', email];
                res.send(`User with ${context} ${value} already exists!`);
            }
        });
    
    app.route('/auth')
        .get((req, res) => {
            res.render('auth');
        })
        .post(async (req, res) => {
            const collection = await db.collection("users");
            const { login, password } = req.body;
            const user = await collection.findOne({ login });
            if (user) {
                const [verifiablePassword] = encrypt(password, user.salt);
                if (user.password === verifiablePassword) {
                    req.session.uid = user._id;
                    res.redirect('/news');
                } else res.send(`Invalid password!`)
            } else res.send(`Login: ${login} not found!`);
        });
    
    app.get('/news', async (req, res) => {
        if (req.session.uid) {
            const collection = await db.collection("news_collection");
            const allNews = await collection.find({}).toArray();
            const login = await getLogin(req.session.uid);
            res.render('news', { allNews, login });   
        } else res.send(401, 'You are not authorized!');
    });
    
    app.route('/show-news/:id')
        .get(async (req, res) => {
            if (req.session.uid) {
                const collection = await db.collection("news_collection");
                const newsId = req.params.id;
                const news = await collection.findOne({ _id: MongoClient.ObjectId(newsId) });
                if (news) {
                    const currentUserId = req.session.uid;
                    const canEdit = currentUserId === news.authorId;
                    const collectionUsers = await db.collection("users");
                    const authorNews = await collectionUsers.findOne({ _id: MongoClient.ObjectId(news.authorId) });
                    const author = `Author of this news - ${authorNews.login}`;
                    const login = await getLogin(req.session.uid);
                    res.render('show-news', { news, canEdit, newsId: news._id, author, login });
                } else res.send('News not found!');
            } else res.send(401, 'You are not authorized!');
        });
    
    app.route('/edit-news/:id')
        .get(async (req, res) => {
            if (req.session.uid) {
                const login = await getLogin(req.session.uid);
                res.render(201, 'edit-news', { newsId: req.params.id, login });
            } else res.send(401, 'You are not authorized!');
        })
        .post(async (req, res) => {
            const collection = await db.collection("news_collection");
            const newsId = req.params.id;
            const { title, body } = req.body;
            await collection.updateOne({ _id: MongoClient.ObjectId(newsId) }, { $set: { title, body } });
            res.redirect(`/show-news/${newsId}`);
        });
    
    app.route('/post-news')
        .get(async (req, res) => {
            if (req.session.uid) {
                const login = await getLogin(req.session.uid);
                res.render('post-news', { login });
            } else res.send(401, 'You are not authorized!');
        })
        .post(async (req, res) => {
            const collection = await db.collection("news_collection");
            const { title, body } = req.body;
            const authorId = req.session.uid;
            const newsMongo = await collection.insertOne(new News(title, body, authorId));
            res.redirect(`/show-news/${newsMongo.insertedId}`);
        });
});
/*app.use((req, res) => {
    res.send(404, `Page [${req.url}] not found!`);
});*/

app.listen(8080, () => {
    console.log(`Example app listening on port 8080!`);
});
