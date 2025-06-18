const express = require('express')
const app = express()
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');
const fs = require('fs');


app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: 'http://127.0.0.1:5500',
  methods: ['GET', 'POST'],
  credentials: true // ถ้ามีการใช้ cookie ด้วย
}));
const con = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'project2'
});
module.exprots = con;
con.connect(function (err) {
  if (err) {
    console.error('MySQL connection error :', err);
    return;
  }
  console.log("Connect to My sql")
});


//index
app.get("/index", function (req, res) {
  res.sendFile(path.join(__dirname, "view/index.html"));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, "view/login.html"));
});
/* app.get('/chiangrai', (req, res) => {
  res.sendFile(path.join(__dirname, "data/chiangrai_districts.geojson"));
}); */
//login
app.post('/login', function (req, res) {
  const { username, password } = req.body
  const sql = 'SELECT * FROM LOGIN WHERE username =?';
  con.query(sql, [username], function (err, result) {
    if (err) {
      console.error('Error qureying database:', err);
      res.status(500).json({ error: 'Error querying database' })
    } else {
      if (result.length === 0) {
        res.status(401).json({ error: "Invalid username or password" });
      } else {
        const user = result[0]
        bcrypt.compare(password, user.password, function (err, isMatch) {
          if (err) {
            console.error('Error comparing password:', err);
            res.status(500).json({ error: 'Error comparing passwords' });
          } else {
            if (isMatch) {
              res.status(200).json({ message: 'Login successful' });
            } else {
              ;
              res.status(401).json({ error: 'Invalid username or password' });
            }
          }

        })
      }
    }
  })
})
// register
app.post('/register', (req, res) => {
  const { username, password } = req.body;

  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      console.error('Hashing error:', err);
      return res.status(500).json({ error: 'Server error' });
    }

    const sql = 'INSERT INTO LOGIN (username, password) VALUES (?, ?)';
    con.query(sql, [username, hashedPassword], (err, result) => {
      if (err) {
        console.error('DB error:', err);
        return res.status(500).json({ error: 'Database error' });
      }
      res.status(201).json({ message: 'User registered successfully' });
    });
  });
});
//-------------------map-----------------
app.post('/map-data', (req, res) => {
  const {
    district_id,
    incomeLevels,
    ageGroups,
    genders,
    seasons
  } = req.body;

  const conditions = [];
  const values = [];

  if (district_id) {
    conditions.push('p.district_id = ?');
    values.push(district_id);
  }

  if (incomeLevels && incomeLevels.length > 0) {
    conditions.push(`p.monthly_income IN (${incomeLevels.map(() => '?').join(',')})`);
    values.push(...incomeLevels);
  }

  if (ageGroups && ageGroups.length > 0) {
    conditions.push(`p.age_range IN (${ageGroups.map(() => '?').join(',')})`);
    values.push(...ageGroups);
  }

  if (genders && genders.length > 0) {
    conditions.push(`p.gender IN (${genders.map(() => '?').join(',')})`);
    values.push(...genders);
  }

  if (seasons && seasons.length > 0) {
    conditions.push(`p.season IN (${seasons.map(() => '?').join(',')})`);
    values.push(...seasons);
  }

  const whereClause = conditions.length > 0 ? conditions.join(' AND ') : '';

  const sql = `
    SELECT 
      d.name_th AS district_name,
      SUM(CASE WHEN p.predict = 0 THEN 1 ELSE 0 END) AS count_low,
      SUM(CASE WHEN p.predict = 1 THEN 1 ELSE 0 END) AS count_medium,
      SUM(CASE WHEN p.predict = 2 THEN 1 ELSE 0 END) AS count_high
    FROM person p
    JOIN district d ON p.district_id = d.id
    WHERE p.predict IS NOT NULL
    ${whereClause ? 'AND ' + whereClause : ''}
    GROUP BY p.district_id;
  `;

  con.query(sql, values, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const riskByDistrict = {};

    // 👉 แปลงผล SQL -> riskByDistrict
  rows.forEach(row => {
  const low = Number(row.count_low);
  const medium = Number(row.count_medium);
  const high = Number(row.count_high);

  const max = Math.max(low, medium, high);

  let risk = 'ไม่ระบุ';

  if (max === high) risk = 'เฝ้าระวังสูง';
  else if (max === medium) risk = 'เฝ้าระวังกลาง';
  else if (max === low) risk = 'เฝ้าระวังต่ำ';

  riskByDistrict[row.district_name.trim()] = risk;  // trim() เผื่อช่องว่าง
});


    console.log('SQL result rows:', rows);

    // ✅ โหลด geojson
    const geojsonPath = path.join(__dirname, 'data/chiangrai_districts.geojson');
    fs.readFile(geojsonPath, 'utf8', (geoErr, geoData) => {
      if (geoErr) return res.status(500).json({ error: geoErr.message });

      const geojson = JSON.parse(geoData);

      // 👉 วน geojson.features แล้วเติม "ไม่ระบุ" ถ้ายังไม่มี
      geojson.features.forEach(feature => {
        const districtName = feature.properties.amp_th.trim();
        if (!riskByDistrict[districtName]) {
          riskByDistrict[districtName] = 'ไม่ระบุ';
        }
      });

      // ✅ ส่ง response
      res.json({
        geojson,
        riskByDistrict
      });
    });
  });
});




app.listen(3000, () => {
  console.log("Server is running : 3000")
});