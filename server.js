const express = require('express')
const app = express()
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');



app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
app.use(cors({
  origin: 'http://localhost:3000', // เปลี่ยนให้ตรงกับ frontend ของคุณ
  credentials: true               // ⭐ เปิดให้ส่ง cookie ได้
}));

app.use(session({
  secret: 'my_super_secret_key',  // เปลี่ยนเป็น ENV จริงจัง
  resave: false,
  saveUninitialized: false,
   cookie: {
    httpOnly: true,
    secure: false, // ถ้าเป็น https ต้อง true
    maxAge: 1000 * 60 * 60 // ตัวอย่าง: 1 ชั่วโมง
  }
}));


//index
app.get("/index", function (req, res) {
  res.sendFile(path.join(__dirname, "view/index.html"));
});
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, "view/login.html"));
});
app.get("/chart", function (req, res) {
  res.sendFile(path.join(__dirname, "view/chart.html"));
});
app.get("/table", function (req, res) {
  res.sendFile(path.join(__dirname, "view/table.html"));
});
app.get('/upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'view', 'upload.html'));
});

/* app.get('/chiangrai', (req, res) => {
  res.sendFile(path.join(__dirname, "data/chiangrai_districts.geojson"));
}); */
//login
app.post('/login', function (req, res) {
  const { username, password } = req.body;
  const sql = 'SELECT * FROM LOGIN WHERE username = ?';

  con.query(sql, [username], function (err, result) {
    if (err) {
      console.error('Error querying database:', err);
      return res.status(500).json({ error: 'Error querying database' });
    }

    if (result.length === 0) {
      return res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
    }

    const user = result[0];
    bcrypt.compare(password, user.password, function (err, isMatch) {
      if (err) {
        console.error('Error comparing password:', err);
        return res.status(500).json({ error: 'Error comparing passwords' });
      }

      if (isMatch) {
        req.session.user = {
          id: user.id,
          username: user.username
        };
        res.status(200).json({ message: 'Login successful' });
      } else {
        res.status(401).json({ error: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      }
    });
  });
});
app.post('/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid'); // ลบ cookie ด้วย
    res.status(200).json({ message: 'Logout successful' });
  });
});



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
function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    next(); // ผ่าน
  } else {
    // ไม่ผ่าน ให้ redirect ไปหน้า login
    res.redirect('/login');
  }
}
app.get('/check-session', (req, res) => {
  console.log('Current session:', req.session);
  if (req.session.user) {
    res.json({ loggedIn: true, user: req.session.user });
  } else {
    res.json({ loggedIn: false });
  }
});
//-------------------map--------------------------------------------------------------
app.post('/map-data', requireLogin, (req, res) => {
  const {
    year, month, date,
    district_id, incomeLevels,
    ageGroups, genders, seasons,
    district, subdistrict
  } = req.body;

  const conditions = [];
  const values = [];

  if (district_id) {
    conditions.push('p.district_id = ?');
    values.push(district_id);
  }

  if (incomeLevels?.length) {
    conditions.push(`p.monthly_income IN (${incomeLevels.map(() => '?').join(',')})`);
    values.push(...incomeLevels);
  }

  if (ageGroups?.length) {
    conditions.push(`p.age_range IN (${ageGroups.map(() => '?').join(',')})`);
    values.push(...ageGroups);
  }

  if (genders?.length) {
    conditions.push(`p.gender IN (${genders.map(() => '?').join(',')})`);
    values.push(...genders);
  }

  if (seasons?.length) {
    conditions.push(`p.season IN (${seasons.map(() => '?').join(',')})`);
    values.push(...seasons);
  }

  if (year) {
    conditions.push(`YEAR(p.birth_date) = ?`);
    values.push(year);
  }

  if (month) {
    conditions.push(`MONTH(p.birth_date) = ?`);
    values.push(month);
  }

  if (date) {
    conditions.push(`DAY(p.birth_date) = ?`);
    values.push(date);
  }

  if (district && district !== 'none' && district !== 'อำเภอ') {
    conditions.push('d.name_th = ?');
    values.push(district);
  }

  if (subdistrict && subdistrict !== 'none' && subdistrict !== 'ตำบล') {
    conditions.push('s.name_th = ?');
    values.push(subdistrict);
  }

  const whereClause = conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';

  const sql = `
    SELECT 
      d.name_th AS district_name,
      SUM(CASE WHEN p.predict = 2 THEN 1 ELSE 0 END) AS count_low,
      SUM(CASE WHEN p.predict = 1 THEN 1 ELSE 0 END) AS count_medium,
      SUM(CASE WHEN p.predict = 0 THEN 1 ELSE 0 END) AS count_high
    FROM person p
    JOIN district d ON p.district_id = d.id
    JOIN sub_district s ON p.subdistrict_id = s.id
    WHERE p.predict IS NOT NULL
    ${whereClause}
    GROUP BY p.district_id
  `;

  con.query(sql, values, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const riskByDistrict = {};
    const districtStats = {};
    let total_high = 0, total_medium = 0, total_low = 0;

    rows.forEach(row => {
      const districtName = row.district_name.trim();
      const low = +row.count_low;
      const medium = +row.count_medium;
      const high = +row.count_high;
      districtStats[districtName] = { low, medium, high };
      total_low += low;
      total_medium += medium;
      total_high += high;

      const max = Math.max(low, medium, high);
      let risk = 'ไม่ระบุ';
      if (max === high) risk = 'เฝ้าระวังสูง';
      else if (max === medium) risk = 'เฝ้าระวังกลาง';
      else if (max === low) risk = 'เฝ้าระวังต่ำ';

      riskByDistrict[districtName] = risk;
    });

    const geojsonPath = path.join(__dirname, 'data/chiangrai_districts.geojson');
    fs.readFile(geojsonPath, 'utf8', (geoErr, geoData) => {
      if (geoErr) return res.status(500).json({ error: geoErr.message });

      const geojson = JSON.parse(geoData);
      geojson.features.forEach(f => {
        const dName = f.properties.amp_th.trim();
        if (!riskByDistrict[dName]) riskByDistrict[dName] = 'ไม่ระบุ';
      });

      res.json({
        geojson,
        riskByDistrict,
        districtStats,
        total: {
          high: total_high,
          medium: total_medium,
          low: total_low
        }
      });
    });
  });
});


//--------------------------------------subdistrict-------------
app.post('/subdistrict-map-data', (req, res) => {
  const {
    districtName,
    incomeLevels,
    ageGroups,
    genders,
    seasons,
    year,
    month,
    date
  } = req.body;

  if (!districtName) {
    return res.status(400).json({ error: 'districtName is required' });
  }

  const conditions = [];
  const values = [];

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

  if (year) {
    conditions.push(`YEAR(p.birth_date) = ?`);
    values.push(year);
  }

  if (month) {
    conditions.push(`MONTH(p.birth_date) = ?`);
    values.push(month);
  }

  if (date) {
    conditions.push(`DAY(p.birth_date) = ?`);
    values.push(date);
  }

  const whereClause = conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';

  const sql = `
    SELECT 
      s.name_th AS sub_district_name,
      SUM(CASE WHEN p.predict = 2 THEN 1 ELSE 0 END) AS count_low,
      SUM(CASE WHEN p.predict = 1 THEN 1 ELSE 0 END) AS count_medium,
      SUM(CASE WHEN p.predict = 0 THEN 1 ELSE 0 END) AS count_high
    FROM person p
    JOIN sub_district s ON p.subdistrict_id = s.id
    JOIN district d ON p.district_id = d.id
    WHERE d.name_th = ? AND p.predict IS NOT NULL
    ${whereClause}
    GROUP BY p.subdistrict_id;
  `;

  con.query(sql, [districtName, ...values], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    const riskBySubdistrict = {};
    const subdistrictStats = {};

    rows.forEach(row => {
      const low = Number(row.count_low);
      const medium = Number(row.count_medium);
      const high = Number(row.count_high);

      const max = Math.max(low, medium, high);
      let risk = 'ไม่ระบุ';
      if (max === high) risk = 'เฝ้าระวังสูง';
      else if (max === medium) risk = 'เฝ้าระวังกลาง';
      else if (max === low) risk = 'เฝ้าระวังต่ำ';

      const name = row.sub_district_name.trim();
      riskBySubdistrict[name] = risk;
      subdistrictStats[name] = { low, medium, high };
    });

    const geojsonPath = path.join(__dirname, 'data/chiangrai_subdistricts.geojson');
    fs.readFile(geojsonPath, 'utf8', (geoErr, geoData) => {
      if (geoErr) return res.status(500).json({ error: geoErr.message });

      const geojson = JSON.parse(geoData);
      const filteredFeatures = geojson.features.filter(f => f.properties.amp_th.trim() === districtName.trim());

      filteredFeatures.forEach(feature => {
        const subdistrictName = feature.properties.tam_th.trim();
        if (!riskBySubdistrict[subdistrictName]) {
          riskBySubdistrict[subdistrictName] = 'ไม่ระบุ';
        }
      });

      res.json({
        features: filteredFeatures,
        riskBySubdistrict,
        subdistrictStats
      });
    });
  });
});

//------------------------------------------SELECT-------------------------------------------------------------
// helper สร้างเงื่อนไข WHERE ตาม param ที่ส่งมา
function buildDateConditions(query) {
  const conditions = [];
  const values = [];

  if (query.year) {
    conditions.push(`YEAR(birth_date) = ?`);
    values.push(query.year);
  }
  if (query.month) {
    conditions.push(`MONTH(birth_date) = ?`);
    values.push(query.month);
  }
  if (query.day) {
    conditions.push(`DAY(birth_date) = ?`);
    values.push(query.day);
  }

  return { conditions, values };
}

app.get('/api/options/year', (req, res) => {
  const { conditions, values } = buildDateConditions(req.query);

  let sql = `SELECT DISTINCT YEAR(birth_date) AS year FROM person WHERE birth_date IS NOT NULL`;
  if (conditions.length) {
    sql += ' AND ' + conditions.join(' AND ');
  }
  sql += ` ORDER BY year DESC`;

  con.query(sql, values, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => r.year));
  });
});

app.get('/api/options/month', (req, res) => {
  const { conditions, values } = buildDateConditions(req.query);

  let sql = `SELECT DISTINCT MONTH(birth_date) AS month FROM person WHERE birth_date IS NOT NULL`;
  if (conditions.length) {
    sql += ' AND ' + conditions.join(' AND ');
  }
  sql += ` ORDER BY month ASC`;

  con.query(sql, values, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => r.month));
  });
});

app.get('/api/options/day', (req, res) => {
  const { conditions, values } = buildDateConditions(req.query);

  let sql = `SELECT DISTINCT DAY(birth_date) AS day FROM person WHERE birth_date IS NOT NULL`;
  if (conditions.length) {
    sql += ' AND ' + conditions.join(' AND ');
  }
  sql += ` ORDER BY day ASC`;

  con.query(sql, values, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows.map(r => r.day));
  });
});


//------------------------------------------SELECT district-------------------------------------------------------------
app.get('/api/options/district', (req, res) => {
  const sql = `
    SELECT DISTINCT name_th FROM district ORDER BY name_th
  `;
  con.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const districts = rows.map(r => r.name_th.trim());
    res.json(districts);
  });
});
//------------------------------------------SELECT subdistrict-------------------------------------------------------------
app.get('/api/options/subdistrict', (req, res) => {
  const { districtName } = req.query;

  if (!districtName) {
    return res.status(400).json({ error: 'districtName is required' });
  }

  const sql = `
    SELECT DISTINCT s.name_th AS subdistrict
    FROM sub_district s
    JOIN district d ON s.district_id = d.id
    JOIN person p ON p.subdistrict_id = s.id
    WHERE d.name_th = ?
    ORDER BY s.name_th
  `;

  con.query(sql, [districtName], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const subdistricts = rows.map(r => r.subdistrict);
    res.json(subdistricts);
  });
});
//------------------------------------------Chart-------------------------------------------------------------
app.get('/districts', (req, res) => {
    const sql = 'SELECT id, name_th FROM district ORDER BY name_th ASC'; // Order by name for better UX
    con.query(sql, (err, rows) => {
        if (err) {
            console.error('❌ MySQL query error for districts:', err.message);
            return res.status(500).json({ error: 'Failed to load districts.' });
        }
        res.json(rows);
    });
});

// API to load subdistricts based on district_id
app.get('/subdistricts', (req, res) => {
    const { district_id } = req.query; // Get district_id from query parameters
    if (!district_id) {
        // Return an empty array or a clear error if district_id is missing
        return res.status(400).json({ error: 'district_id is required.' });
    }

    const sql = 'SELECT id, name_th FROM sub_district WHERE district_id = ? ORDER BY name_th ASC';
    con.query(sql, [district_id], (err, rows) => {
        if (err) {
            console.error('❌ MySQL query error for subdistricts:', err.message);
            return res.status(500).json({ error: 'Failed to load subdistricts.' });
        }
        res.json(rows);
    });
});

// UPDATED API: Get distinct years based on optional month and day filters
app.get('/years-with-data', (req, res) => {
    const { month, day } = req.query;
    const conditions = ['birth_date IS NOT NULL'];
    const values = [];

    if (month) {
        conditions.push('MONTH(birth_date) = ?');
        values.push(month);
    }
    if (day) {
        conditions.push('DAY(birth_date) = ?');
        values.push(day);
    }

    const sql = `SELECT DISTINCT YEAR(birth_date) AS year FROM person WHERE ${conditions.join(' AND ')} ORDER BY year DESC`;
    con.query(sql, values, (err, rows) => {
        if (err) {
            console.error('❌ MySQL query error for years:', err.message);
            return res.status(500).json({ error: 'Failed to load years.' });
        }
        res.json(rows.map(row => row.year));
    });
});

// UPDATED API: Get distinct months for a given year and optional day filter
app.get('/months-with-data', (req, res) => {
    const { year, day } = req.query;
    const conditions = ['birth_date IS NOT NULL'];
    const values = [];

    if (year) {
        conditions.push('YEAR(birth_date) = ?');
        values.push(year);
    }
    if (day) {
        conditions.push('DAY(birth_date) = ?');
        values.push(day);
    }

    // If no specific year or day is provided, the conditions array will only have 'birth_date IS NOT NULL'
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT DISTINCT MONTH(birth_date) AS month FROM person ${whereClause} ORDER BY month ASC`;
    
    con.query(sql, values, (err, rows) => {
        if (err) {
            console.error('❌ MySQL query error for months:', err.message);
            return res.status(500).json({ error: 'Failed to load months.' });
        }
        res.json(rows.map(row => row.month));
    });
});

// MODIFIED API: Get distinct days for a given year and month (now both are optional)
app.get('/days-with-data', (req, res) => {
    const { year, month } = req.query;
    const conditions = ['birth_date IS NOT NULL']; // Base condition
    const values = [];

    if (year) {
        conditions.push('YEAR(birth_date) = ?');
        values.push(year);
    }
    if (month) {
        conditions.push('MONTH(birth_date) = ?');
        values.push(month);
    }

    // Construct the WHERE clause. If only 'birth_date IS NOT NULL' is there, it's just 'WHERE birth_date IS NOT NULL'
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT DISTINCT DAY(birth_date) AS day FROM person ${whereClause} ORDER BY day ASC`;
    
    con.query(sql, values, (err, rows) => {
        if (err) {
            console.error('❌ MySQL query error for days:', err.message);
            return res.status(500).json({ error: 'Failed to load days.' });
        }
        res.json(rows.map(row => row.day));
    });
});

// POST /chart-data to receive filters from client and return aggregated data
app.post('/chart-data', requireLogin, (req, res) => {
    const {
        district_id,
        subdistrict_id,
        income,
        ageGroups,
        gender,
        season,
        selectedYear, // New date filter
        selectedMonth, // New date filter
        selectedDay // New date filter
    } = req.body || {};

    const conditions = [];
    const values = [];

    // Add conditions for each filter if present and not empty
    if (district_id && district_id !== "") {
        conditions.push('p.district_id = ?');
        values.push(district_id);
    }

    if (subdistrict_id && subdistrict_id !== "") {
        conditions.push('p.subdistrict_id = ?');
        values.push(subdistrict_id);
    }

    // Handle array-based filters using IN clause
    if (income && income.length > 0) {
        conditions.push(`p.monthly_income IN (${income.map(() => '?').join(',')})`);
        values.push(...income);
    }

    if (ageGroups && ageGroups.length > 0) {
        conditions.push(`p.age_range IN (${ageGroups.map(() => '?').join(',')})`);
        values.push(...ageGroups);
    }

    if (gender && gender.length > 0) {
        conditions.push(`p.gender IN (${gender.map(() => '?').join(',')})`);
        values.push(...gender);
    }

    if (season && season.length > 0) {
        conditions.push(`p.season IN (${season.map(() => '?').join(',')})`);
        values.push(...season);
    }

    // New date filters based on birth_date
    if (selectedYear && selectedYear !== "") {
        conditions.push('YEAR(p.birth_date) = ?');
        values.push(selectedYear);
    }
    if (selectedMonth && selectedMonth !== "") {
        conditions.push('MONTH(p.birth_date) = ?');
        values.push(selectedMonth);
    }
    if (selectedDay && selectedDay !== "") {
        conditions.push('DAY(p.birth_date) = ?');
        values.push(selectedDay);
    }

    // Construct the WHERE clause
    // Always include 'p.predict IS NOT NULL' as a base condition
    const baseCondition = 'p.predict IS NOT NULL';
    const whereClause = conditions.length > 0 ? `WHERE ${baseCondition} AND ` + conditions.join(' AND ') : `WHERE ${baseCondition}`;

    let selectClause = '';
    let groupByClause = '';
    let joinClause = '';
    let orderByName = '';
    let nameField = '';

    // Dynamically adjust GROUP BY and SELECT based on filters
    if (district_id && !subdistrict_id) {
        // If a district is selected but no subdistrict, group by subdistricts for that district
        selectClause = 'sd.name_th AS item_name';
        joinClause = 'JOIN sub_district sd ON p.subdistrict_id = sd.id';
        groupByClause = 'GROUP BY p.subdistrict_id';
        orderByName = 'ORDER BY sd.name_th ASC';
        nameField = 'item_name';
    } else {
        // Otherwise (no district, or district AND subdistrict, or just subdistrict), group by districts
        selectClause = 'd.name_th AS item_name';
        joinClause = 'JOIN district d ON p.district_id = d.id';
        groupByClause = 'GROUP BY p.district_id';
        orderByName = 'ORDER BY d.name_th ASC';
        nameField = 'item_name';
    }

    // SQL query to aggregate risk data
    const sql = `
        SELECT
            ${selectClause},
            SUM(CASE WHEN p.predict = 0 THEN 1 ELSE 0 END) AS count_high,
            SUM(CASE WHEN p.predict = 1 THEN 1 ELSE 0 END) AS count_medium,
            SUM(CASE WHEN p.predict = 2 THEN 1 ELSE 0 END) AS count_low
        FROM person p
        ${joinClause}
        ${whereClause}
        ${groupByClause}
        ${orderByName}
    `;

    con.query(sql, values, (err, rows) => {
        if (err) {
            console.error('❌ MySQL query error for chart data:', err.message);
            return res.status(500).json({ error: 'Failed to load chart data.' });
        }

        const riskByItem = {};
        let total_high = 0, total_medium = 0, total_low = 0;

        rows.forEach(row => {
            const low = Number(row.count_low || 0);
            const medium = Number(row.count_medium || 0);
            const high = Number(row.count_high || 0);

            total_low += low;
            total_medium += medium;
            total_high += high;

            riskByItem[row[nameField].trim()] = { low, medium, high };
        });

        res.json({
            riskByItem,
            total: { high: total_high, medium: total_medium, low: total_low }
        });
    });
});

//----------------------------------------------------------UPLOAD----------------------------------------------------------
const multer = require('multer');
const { spawn } = require('child_process');
const upload = multer({ dest: 'uploads/' }); // เก็บไฟล์ชั่วคราว

// Serve upload page

app.get('/upload', (req, res) => {
  res.sendFile(path.join(__dirname, 'view', 'upload.html'));
});

app.post('/upload', upload.single('csvFile'), (req, res) => {
  const filePath = req.file.path;

  const python = spawn('python', ['ml_predict.py', filePath]);

  let output = '';
  python.stdout.on('data', (data) => output += data.toString());
  python.stderr.on('data', (err) => console.error('Python Error:', err.toString()));

  python.on('close', (code) => {
    try {
      let results = JSON.parse(output);

      // กรองเอาแค่จังหวัดเชียงราย
      results = results.filter(row => row['Pro.จังหวัด'] === 'จ.เชียงราย');

if (results.length === 0) {
  return res.json({ status: 'no_data', message: 'ไม่พบข้อมูลจังหวัดเชียงรายในไฟล์ที่อัปโหลด' });
}

      // ฟังก์ชันแปลงข้อมูล
      function combine_district_from_string(row) {
  const map = {
    'อ.เมืองเชียงราย': 1,
    'อ.เวียงชัย': 2,
    'อ.เชียงของ': 3,
    'อ.เทิง': 4,
    'อ.พาน': 5,
    'อ.ป่าแดด': 6,
    'อ.แม่จัน': 7,
    'อ.เชียงแสน': 8,
    'อ.แม่สาย': 9,
    'อ.แม่สรวย': 10,
    'อ.เวียงป่าเป้า': 11,
    'อ.พญาเม็งราย': 12,
    'อ.เวียงแก่น': 13,
    'อ.ขุนตาล': 14,
    'อ.แม่ฟ้าหลวง': 15,
    'อ.แม่ลาว': 16,
    'อ.เวียงเชียงรุ้ง': 17,
    'อ.ดอยหลวง': 18,
  };
  const name = row['Pro.อำเภอ / เขต']?.trim();
  return map[name] || null;
}

function normalize(str) {
  return str?.trim().replace(/\s+/g, ''); // ตัดช่องว่างทุกแบบ
}

 function combine_subdistrict(row) {
  const map = {
  "อ.เมืองเชียงราย|ต.เวียง": 101,
  "อ.เมืองเชียงราย|ต.รอบเวียง": 102,
  "อ.เมืองเชียงราย|ต.บ้านดู่": 103,
  "อ.เมืองเชียงราย|ต.นางแล": 104,
  "อ.เมืองเชียงราย|ต.แม่ข้าวต้ม": 105,
  "อ.เมืองเชียงราย|ต.แม่ยาว": 106,
  "อ.เมืองเชียงราย|ต.สันทราย": 107,
  "อ.เมืองเชียงราย|ต.แม่กรณ์": 108,
  "อ.เมืองเชียงราย|ต.ห้วยชมภู": 109,
  "อ.เมืองเชียงราย|ต.ห้วยสัก": 110,
  "อ.เมืองเชียงราย|ต.ริมกก": 111,
  "อ.เมืองเชียงราย|ต.ดอยลาน": 112,
  "อ.เมืองเชียงราย|ต.ป่าอ้อดอนชัย": 113,
  "อ.เมืองเชียงราย|ต.ท่าสาย": 114,
  "อ.เมืองเชียงราย|ต.ดอยฮาง": 115,
  "อ.เมืองเชียงราย|ต.ท่าสุด": 116,
  "อ.เวียงชัย|ต.เวียงชัย": 201,
  "อ.เวียงชัย|ต.ผางาม": 202,
  "อ.เวียงชัย|ต.เวียงเหนือ": 203,
  "อ.เวียงชัย|ต.ดอนศิลา": 204,
  "อ.เวียงชัย|ต.เมืองชุม": 205,
  "อ.เชียงของ|ต.เวียง": 301,
  "อ.เชียงของ|ต.สถาน": 302,
  "อ.เชียงของ|ต.ครึ่ง": 303,
  "อ.เชียงของ|ต.บุญเรือง": 304,
  "อ.เชียงของ|ต.ห้วยซ้อ": 305,
  "อ.เชียงของ|ต.ศรีดอนชัย": 306,
  "อ.เชียงของ|ต.ริมโขง": 307,
  "อ.เทิง|ต.เวียง": 401,
  "อ.เทิง|ต.งิ้ว": 402,
  "อ.เทิง|ต.ปล้อง": 403,
  "อ.เทิง|ต.แม่ลอย": 404,
  "อ.เทิง|ต.เชียงเคี่ยน": 405,
  "อ.เทิง|ต.ตับเต่า": 406,
  "อ.เทิง|ต.หงาว": 407,
  "อ.เทิง|ต.สันทรายงาม": 408,
  "อ.เทิง|ต.ศรีดอนไชย": 409,
  "อ.เทิง|ต.หนองแรด": 410,
  "อ.พาน|ต.สันมะเค็ด": 501,
  "อ.พาน|ต.แม่อ้อ": 502,
  "อ.พาน|ต.ธารทอง": 503,
  "อ.พาน|ต.สันติสุข": 504,
  "อ.พาน|ต.ดอยงาม": 505,
  "อ.พาน|ต.หัวง้ม": 506,
  "อ.พาน|ต.เจริญเมือง": 507,
  "อ.พาน|ต.ป่าหุ่ง": 508,
  "อ.พาน|ต.ม่วงคำ": 509,
  "อ.พาน|ต.ทรายขาว": 510,
  "อ.พาน|ต.สันกลาง": 511,
  "อ.พาน|ต.แม่เย็น": 512,
  "อ.พาน|ต.เมืองพาน": 513,
  "อ.พาน|ต.ทานตะวัน": 514,
  "อ.พาน|ต.เวียงห้าว": 515,
  "อ.ป่าแดด|ต.ป่าแดด": 601,
  "อ.ป่าแดด|ต.ป่าแงะ": 602,
  "อ.ป่าแดด|ต.สันมะค่า": 603,
  "อ.ป่าแดด|ต.โรงช้าง": 604,
  "อ.ป่าแดด|ต.ศรีโพธิ์เงิน": 605,
  "อ.แม่จัน|ต.แม่จัน": 701,
  "อ.แม่จัน|ต.จันจว้า": 702,
  "อ.แม่จัน|ต.แม่คำ": 703,
  "อ.แม่จัน|ต.ป่าซาง": 704,
  "อ.แม่จัน|ต.สันทราย": 705,
  "อ.แม่จัน|ต.ท่าข้าวเปลือก": 706,
  "อ.แม่จัน|ต.ป่าตึง": 707,
  "อ.แม่จัน|ต.แม่ไร่": 708,
  "อ.แม่จัน|ต.ศรีค้ำ": 709,
  "อ.แม่จัน|ต.จันจว้าใต้": 710,
  "อ.แม่จัน|ต.จอมสวรรค์": 711,
  "อ.เชียงแสน|ต.เวียง": 801,
  "อ.เชียงแสน|ต.ป่าสัก": 802,
  "อ.เชียงแสน|ต.บ้านแซว": 803,
  "อ.เชียงแสน|ต.ศรีดอนมูล": 804,
  "อ.เชียงแสน|ต.แม่เงิน": 805,
  "อ.เชียงแสน|ต.โยนก": 806,
  "อ.แม่สาย|ต.แม่สาย": 901,
  "อ.แม่สาย|ต.ห้วยไคร้": 902,
  "อ.แม่สาย|ต.เกาะช้าง": 903,
  "อ.แม่สาย|ต.โป่งผา": 904,
  "อ.แม่สาย|ต.ศรีเมืองชุม": 905,
  "อ.แม่สาย|ต.เวียงพางคำ": 906,
  "อ.แม่สาย|ต.บ้านด้าย": 907,
  "อ.แม่สาย|ต.โป่งงาม": 908,
  "อ.แม่สรวย|ต.แม่สรวย": 1001,
  "อ.แม่สรวย|ต.ป่าแดด": 1002,
  "อ.แม่สรวย|ต.แม่พริก": 1003,
  "อ.แม่สรวย|ต.ศรีถ้อย": 1004,
  "อ.แม่สรวย|ต.ท่าก๊อ": 1005,
  "อ.แม่สรวย|ต.วาวี": 1006,
  "อ.แม่สรวย|ต.เจดีย์หลวง": 1007,
  "อ.เวียงป่าเป้า|ต.สันสลี": 1101,
  "อ.เวียงป่าเป้า|ต.เวียง": 1102,
  "อ.เวียงป่าเป้า|ต.บ้านโป่ง": 1103,
  "อ.เวียงป่าเป้า|ต.ป่างิ้ว": 1104,
  "อ.เวียงป่าเป้า|ต.เวียงกาหลง": 1105,
  "อ.เวียงป่าเป้า|ต.แม่เจดีย์": 1106,
  "อ.เวียงป่าเป้า|ต.แม่เจดีย์ใหม่": 1107,
  "อ.พญาเม็งราย|ต.แม่เปา": 1201,
  "อ.พญาเม็งราย|ต.แม่ต๋ำ": 1202,
  "อ.พญาเม็งราย|ต.ไม้ยา": 1203,
  "อ.พญาเม็งราย|ต.เม็งราย": 1204,
  "อ.พญาเม็งราย|ต.ตาดควัน": 1205,
  "อ.เวียงแก่น|ต.ม่วงยาย": 1301,
  "อ.เวียงแก่น|ต.ปอ": 1302,
  "อ.เวียงแก่น|ต.หล่ายงาว": 1303,
  "อ.เวียงแก่น|ต.ท่าข้าม": 1304,
  "อ.ขุนตาล|ต.ต้า": 1401,
  "อ.ขุนตาล|ต.ป่าตาล": 1402,
  "อ.ขุนตาล|ต.ยางฮอม": 1403,
  "อ.แม่ฟ้าหลวง|ต.เทอดไทย": 1501,
  "อ.แม่ฟ้าหลวง|ต.แม่สลองใน": 1502,
  "อ.แม่ฟ้าหลวง|ต.แม่สลองนอก": 1503,
  "อ.แม่ฟ้าหลวง|ต.แม่ฟ้าหลวง": 1504,
  "อ.แม่ลาว|ต.ดงมะดะ": 1601,
  "อ.แม่ลาว|ต.จอมหมอกแก้ว": 1602,
  "อ.แม่ลาว|ต.บัวสลี": 1603,
  "อ.แม่ลาว|ต.ป่าก่อดำ": 1604,
  "อ.แม่ลาว|ต.โป่งแพร่": 1605,
  "อ.เวียงเชียงรุ้ง|ต.ทุ่งก่อ": 1701,
  "อ.เวียงเชียงรุ้ง|ต.ดงมหาวัน": 1702,
  "อ.ดอยหลวง|ต.ปงน้อย": 1801,
  "อ.ดอยหลวง|ต.โชคชัย": 1802,
  "อ.ดอยหลวง|ต.หนองป่าก่อ": 1803
}
;

    const district = normalize(row["Pro.อำเภอ / เขต"]);
  const subdistrict = normalize(row["Pro.ตำบล / แขวง"]);
  const key = `${district}|${subdistrict}`;

  return map[key] || null;
}

      

      function combine_birth_date(row) {
        const y = parseInt(row['ปี']);
        const m = parseInt(row['เดือน']);
        const d = parseInt(row['วันที่']);
        if (!y || !m || !d) return null;
        const gregorianYear = String(y).padStart(2, '0');
        const mm = String(m).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        return `${gregorianYear}-${mm}-${dd}`;
      }

const incomeMap = {
        "ไม่มีรายได้": "ไม่มีรายได้",
        "น้อยมาก": "รายได้น้อยมาก",
        "น้อย": "รายได้น้อย",
        "ปานกลาง": "รายได้ปานกลาง",
        "ปานกลางค่อนสูง": "รายได้ปานกลางค่อนสูง",
        "สูง": "รายได้สูง",
        "สูงมาก": "รายได้สูงมาก",
      };

      function normalizeIncomeLabel(label) {
        if (!label) return label;
        if (label.includes("รายได้")) return label;  // ถ้าเดิมมี "รายได้" แล้วไม่ต้องทำอะไร
        return incomeMap[label] ?? label;             // ถ้าเจอในแมปก็แปลง ถ้าไม่เจอคืนค่าเดิม
      }

      results = results.map(row => ({
        id: row['ลำดับ'],
        gender: row['เพศ'],
        marital_status: row["สถานภาพสมรส"],

        // แปลงให้มีคำว่า "รายได้" ก่อนเก็บ DB
        monthly_income: normalizeIncomeLabel(row["ระดับรายได้"]),

        season: row['ฤดูกาล'],
        age_range: row["ช่วงอายุ"],
        district_id: combine_district_from_string(row),
        subdistrict_id: combine_subdistrict(row),
        birth_date: combine_birth_date(row),
        province_id: 1,  // รหัสจังหวัดเชียงราย
        predict: row['predict'],
      }));
      

      // อัปเดตฐานข้อมูลทีละแถว
      results.forEach(row => {
  const sql = `
    INSERT INTO person
      (gender, marital_status, monthly_income, season, age_range, district_id, subdistrict_id, birth_date, province_id, predict)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const values = [
    row.gender, row.marital_status, row.monthly_income, row.season, row.age_range,
    row.district_id, row.subdistrict_id, row.birth_date, row.province_id, row.predict,
  ];

  if (values.length !== 10) {
    console.error(`Error: values count mismatch, got ${values.length} values but expected 10`);
    return;
  }

  con.query(sql, values, (err, result) => {
    if (err) {
      console.error('DB Insert Error:', err);
    }
  });
});

      
      console.log("parsed results:", results);
      res.json({ status: 'success', inserted: results.length });
    } catch (e) {
    
      console.error('Parse Error:', e);
      res.status(500).json({ status: 'error', message: 'Failed to process data.' });
    }
  });
});



app.listen(3000, () => {
  console.log("Server is running : 3000")
});