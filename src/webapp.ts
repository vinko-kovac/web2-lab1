import express from 'express';
import fs from 'fs';
import path from 'path'
import https from 'https';
import { auth, requiresAuth } from 'express-openid-connect';
import { Pool } from 'pg'; 
import dotenv from 'dotenv'
dotenv.config()

const app = express();
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true })); 

app.set("views", path.join(__dirname, "views"));
app.set('view engine', 'pug');

const port = 4080;

const config = { 
    authRequired : false,
    idpLogout : true, //login not only from the app, but also from identity provider
    secret: process.env.SECRET,
    baseURL: `https://localhost:${port}`,
    clientID: process.env.CLIENT_ID,
    issuerBaseURL: 'https://dev-cyykuxi4uwdrkqc8.us.auth0.com',
    clientSecret: process.env.CLIENT_SECRET,
    authorizationParams: {
      response_type: 'code' ,
      //scope: "openid profile email"   
     },
  };
  // auth router attaches /login, /logout, and /callback routes to the baseURL

const pool = new Pool({   
    user: process.env.DB_USER,   
    host: process.env.DB_HOST,   
    database: 'web2_lab1_db',   
    password: process.env.DB_PASSWORD,   
    port: 5432,   
    ssl : true
})

app.use(auth(config));

app.get('/',  function (req, res) {
    let username : string | undefined;
    if (req.oidc.isAuthenticated()) {
      username = req.oidc.user?.name ?? req.oidc.user?.sub;
    }
    res.render('index', {username});
});

app.get('/private', requiresAuth(), function (req, res) {       
  const user = JSON.stringify(req.oidc.user);      
  res.render('private'); 
});

app.post('/add', async function(req, res) {
  const name = req.body.compname;
  const participants = req.body.participants;
  const points = req.body.points;
  let splitted = participants.split(";");
  let pointSplit = points.split("/");
  let win = pointSplit[0];
  let draw = pointSplit[1];
  let lose = pointSplit[2];
  let competitors = [];
  
  let result = await pool.query('INSERT INTO competition (name, win, draw, lose) VALUES ($1, $2, $3, $4) RETURNING *', [name, win, draw, lose]);
  //console.log(result.rows[0]);
  let id = result.rows[0].competitionid;
  for (let i = 0; i< splitted.length; i++) {
    console.log(splitted[i]);
    result = await pool.query('INSERT INTO participant (name, points, rank, competition) VALUES ($1, $2, $3, $4) RETURNING *', [splitted[i], 0, 1, id]);
    competitors.push(result.rows[0].participantid);
    //console.log(result.rows[0]);
  }

  let l = competitors.length;

  for (let i = 0; i < l-1; i++) {
    result = await pool.query('INSERT INTO games (home, away, competition, week) VALUES ($1, $2, $3, $4)', [competitors[(0+i)%(l-1)], competitors[l-1], id, i+1]);
    for (let j = 1; j <= (l-1)/2; j++) {
      result = await pool.query('INSERT INTO games (home, away, competition, week) VALUES ($1, $2, $3, $4)', [competitors[(j+i)%(l-1)], competitors[(l+i-j-1)%(l-1)], id, i+1]);
    }
  }

  return res.redirect('/private');

})

https.createServer({
    key: fs.readFileSync('server.key'),
    cert: fs.readFileSync('server.cert')
    }, app)
    .listen(port, function () {
      console.log(`Server running at https://localhost:${port}/`);
});