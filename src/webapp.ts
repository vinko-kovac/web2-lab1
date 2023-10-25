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

const externalUrl = process.env.RENDER_EXTERNAL_URL;
const port = externalUrl && process.env.PORT ? parseInt(process.env.PORT) : 4080;

const config = { 
    authRequired : false,
    idpLogout : true, //login not only from the app, but also from identity provider
    secret: process.env.SECRET,
    baseURL: externalUrl || `https://localhost:${port}`,
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

interface team {
  participantid: number,
  name: string,
  rank: number,
  points: number
}

interface game {
  id: number,
  home: string,
  homeid: number,
  away: string,
  awayid: number,
  homescore: number,
  awayscore: number,
  week: number,
  score: string
}

app.use(auth(config));

app.get('/',  function (req, res) {
    let username : string | undefined;
    if (req.oidc.isAuthenticated()) {
      username = req.oidc.user?.name ?? req.oidc.user?.sub;
    }
    res.render('index', {username});
});

app.get('/competition/:id', async function (req,res) {
  let result = await pool.query('SELECT competitionid, name FROM competition WHERE competitionid=$1', [req.params.id]);
  if (result.rowCount == 0) {
    let error = "Competition does not exist."
    res.render('error', {error});
  } else {
    let id = result.rows[0].competitionid;
    let name = result.rows[0].name;

    result = await pool.query('SELECT participantid, name, points, rank FROM participant WHERE competition=$1 ORDER BY rank', [id]);
    let teams = [];
    for (let i = 0; i<result.rowCount; i++) {
      let t = {participantid: result.rows[i].participantid, name: result.rows[i].name, rank: result.rows[i].rank, points: result.rows[i].points};
      teams.push(t);
    }

    result = await pool.query('SELECT home, away, homescore, awayscore, week FROM games WHERE competition=$1 ORDER BY week', [id]);
    let games = [];
    //console.log(result.rowCount);
    for (let i = 0; i<result.rowCount; i++) {
      let h = result.rows[i].home;
      let a = result.rows[i].away;
      let home;
      let away;
      for (let j = 0; j<teams.length; j++) {
        if (teams[j].participantid == h) {
          home = teams[j].name;
        } else if (teams[j].participantid == a) {
          away = teams[j].name;
        }
        if (h == a) {
          away = null;
        }
      }
      let score = result.rows[i].homescore +"-"+result.rows[i].awayscore;
      let g = {home: home, away: away, homescore: result.rows[i].homescore, awayscore: result.rows[i].awayscore, week: result.rows[i].week, score: score};
      games.push(g);
    }

    res.render('competition', {name, teams, games})
  }
});

app.get('/changeCompetition/:id', requiresAuth(), async function(req, res) {
  let result = await pool.query('SELECT competitionid, name, userid FROM competition WHERE competitionid=$1', [req.params.id]);
  if (result.rowCount == 0) {
    let error = "Competition does not exist."
    res.render('error', {error});
  } else {
    let id = result.rows[0].competitionid;
    let name = result.rows[0].name;
    let userid = result.rows[0].userid;

    if(userid != req.oidc.user?.name) {
      let error = "You don't have access to this competition."
      res.render('error', {error});
    } else {
      result = await pool.query('SELECT participantid, name, points, rank FROM participant WHERE competition=$1 ORDER BY rank', [id]);
      let teams = [];
      for (let i = 0; i<result.rowCount; i++) {
        let t = {participantid: result.rows[i].participantid, name: result.rows[i].name, rank: result.rows[i].rank, points: result.rows[i].points};
        teams.push(t);
      }

      result = await pool.query('SELECT home, away, homescore, awayscore, week FROM games WHERE competition=$1 ORDER BY week, home', [id]);
      let games = [];
      //console.log(result.rowCount);
      for (let i = 0; i<result.rowCount; i++) {
        let id = i;
        let h = result.rows[i].home;
        let a = result.rows[i].away;
        let home;
        let away;
        for (let j = 0; j<teams.length; j++) {
          if (teams[j].participantid == h) {
            home = teams[j].name;
          } else if (teams[j].participantid == a) {
            away = teams[j].name;
          }
          if (h == a) {
            away = null;
          }
        }
        let score = result.rows[i].homescore +"-"+result.rows[i].awayscore;
        let g = {id: id, home: home, away: away, homeid: h, awayid: a, homescore: result.rows[i].homescore, awayscore: result.rows[i].awayscore, week: result.rows[i].week, score: score};
        games.push(g);
      }

      let url = "/change/"+id;

      //console.log("usao");

      res.render('change', {id, name, teams, games, url})
    }
  }
});

app.get('/private', requiresAuth(), async function (req, res) {       
  const user = req.oidc.user?.name;
  //console.log(user);
  let result = await pool.query('SELECT competitionid, name FROM competition WHERE userid=$1', [user]);
  //console.log(result);
  let rows = [];
  let p: [string, string, string];
  for (let i = 0; i<result.rowCount; i++) {
    //console.log(result.rows[i]);
    p = [result.rows[i].name, externalUrl+"/competition/"+result.rows[i].competitionid, externalUrl+"/changeCompetition/"+result.rows[i].competitionid];
    rows.push(p);
  }
  //let rowsString = JSON.stringify(rows);
  res.render('private', {rows}); 
});

app.post('/add', requiresAuth(), async function(req, res) {
  const name = req.body.compname;
  const participants = req.body.participants;
  const points = req.body.points;
  const user = req.oidc.user?.name;
  let splitted = participants.split(";");
  let pointSplit = points.split("/");
  let win = pointSplit[0];
  let draw = pointSplit[1];
  let lose = pointSplit[2];
  let competitors = [];
  
  let result = await pool.query('INSERT INTO competition (name, win, draw, lose, userid) VALUES ($1, $2, $3, $4, $5) RETURNING *', [name, win, draw, lose, user]);
  //console.log(result.rows[0]);
  let id = result.rows[0].competitionid;
  for (let i = 0; i< splitted.length; i++) {
    //console.log(splitted[i]);
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
  if (l%2 != 0) {
    result = await pool.query('INSERT INTO games (home, away, competition, week) VALUES ($1, $2, $3, $4)', [competitors[l-1], competitors[l-1], id, l]);
    for (let i = 0; i < l-2; i=i+2) {
      result = await pool.query('INSERT INTO games (home, away, competition, week) VALUES ($1, $2, $3, $4)', [competitors[i], competitors[i+1], id, l]);
    }
  }

  return res.redirect('/private');
});

app.post('/change/:id', requiresAuth(), async function(req, res) {
  const ids = req.body.id;
  let result = await pool.query('SELECT competitionid, name, userid, win, draw, lose FROM competition WHERE competitionid=$1', [req.params.id]);
  if (result.rowCount == 0) {
    let error = "Competition does not exist."
    res.render('error', {error});
  } else {
    let id = result.rows[0].competitionid;
    let name = result.rows[0].name;
    let userid = result.rows[0].userid;
    let win = result.rows[0].win;
    let draw = result.rows[0].draw;
    let lose = result.rows[0].lose;

    if(userid != req.oidc.user?.name) {
      let error = "You don't have access to this competition."
      res.render('error', {error});
    } else {
      result = await pool.query('SELECT participantid, name, points, rank FROM participant WHERE competition=$1 ORDER BY rank', [id]);
      let teams = [];
      for (let i = 0; i<result.rowCount; i++) {
        let t = {participantid: result.rows[i].participantid, name: result.rows[i].name, rank: result.rows[i].rank, points: 0};
        teams.push(t);
      }

      result = await pool.query('SELECT home, away, homescore, awayscore, week FROM games WHERE competition=$1 ORDER BY week, home', [id]);
      let games = [];
      //console.log(result.rowCount);
      for (let i = 0; i<result.rowCount; i++) {
        let idg = i;
        let h = result.rows[i].home;
        let a = result.rows[i].away;
        let home;
        let away;
        for (let j = 0; j<teams.length; j++) {
          if (teams[j].participantid == h) {
            home = teams[j].name;
          } else if (teams[j].participantid == a) {
            away = teams[j].name;
          }
          if (h == a) {
            away = null;
          }
        }
        let g = {id: idg, home: home, away: away, homeid: h, awayid: a, homescore: result.rows[i].homescore, awayscore: result.rows[i].awayscore, week: result.rows[i].week};
        games.push(g);
      }

      for (let i = 0; i<ids.length; i++) {
        let gid = String(ids[i]);
        let g = req.body[gid];
        for (let j = 0; j<games.length; j++) {
          if (games[j].id == Number(gid)) {
            if (g != "") {
              //console.log("usao");
              let split = g.split("-");
              let hs = Number(split[0]);
              let as = Number(split[1]);
              result = await pool.query('UPDATE games SET homescore=$1, awayscore=$2 WHERE home=$3 AND away=$4 AND competition=$5', [hs, as, games[j].homeid, games[j].awayid, id]);
              if (hs > as) {
                for (let k = 0; k<teams.length; k++) {
                  if (games[j].homeid == teams[k].participantid) {
                    teams[k].points += win;
                  }
                }
              } else if (hs < as) {
                for (let k = 0; k<teams.length; k++) {
                  if (games[j].awayid == teams[k].participantid) {
                    teams[k].points += win;
                  }
                }
              } else {
                for (let k = 0; k<teams.length; k++) {
                  if (games[j].homeid == teams[k].participantid) {
                    teams[k].points += draw;
                  } else if (games[j].awayid == teams[k].participantid) {
                    teams[k].points += draw;
                  }
                }
              }
            }
          }
        }
      }

      for (let i = 0; i<teams.length; i++) {
        let rank = 1;
        for (let j = 0; j<teams.length; j++) {
          if (teams[i].points < teams[j].points) {
            rank++;
          }
        }
        teams[i].rank = rank;
      }

      for (let i = 0; i<teams.length; i++) {
        result = await pool.query('UPDATE participant SET rank=$1, points=$2 WHERE participantid=$3', [teams[i].rank, teams[i].points, teams[i].participantid]);
      }


      return res.redirect('/changeCompetition/'+id);
    }
  }
});

if (externalUrl) {
  const hostname = '0.0.0.0';
  app.listen(port, hostname, () => {
    console.log(`Server locally running at http://${hostname}:${port}/ and from outside on ${externalUrl}`);
  });
} else {
  https.createServer({
      key: fs.readFileSync('server.key'),
      cert: fs.readFileSync('server.cert')
      }, app)
      .listen(port, function () {
        console.log(`Server running at https://localhost:${port}/`);
  });
}