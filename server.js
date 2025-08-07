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
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = result[0];
    bcrypt.compare(password, user.password, function (err, isMatch) {
      if (err) {
        console.error('Error comparing password:', err);
        return res.status(500).json({ error: 'Error comparing passwords' });
      }

      if (isMatch) {
        // ⭐ เก็บ user ไว้ใน session
        req.session.user = {
          id: user.id,
          username: user.username
        };
        res.status(200).json({ message: 'Login successful' });
      } else {
        res.status(401).json({ error: 'Invalid username or password' });
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
  sql += ` ORDER BY year ASC`;

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
      function combine_income(row) {
        const parts = [];
        if (row['ระดับรายได้_ไม่มีรายได้'] === 1) parts.push("ไม่มีรายได้");
        if (row['ระดับรายได้_สูงมาก'] === 1) parts.push("รายได้สูงมาก");
        if (row['ระดับรายได้_ปานกลาง'] === 1) parts.push("รายได้ปานกลาง");
        if (row['ระดับรายได้_ปานกลางค่อนสูง'] === 1) parts.push("รายได้ปานกลางค่อนสูง");
        if (row['ระดับรายได้_น้อย'] === 1) parts.push("รายได้น้อย");
        if (row['ระดับรายได้_น้อยมาก'] === 1) parts.push("รายได้น้อยมาก");
        return parts.length ? parts.join(' / ') : "ไม่ระบุ";
      }

      function combine_marital(row) {
        const parts = [];
        if (row['สถานภาพสมรส_โสด'] === 1) parts.push("โสด");
        if (row['สถานภาพสมรส_คู่'] === 1) parts.push("คู่");
        if (row['สถานภาพสมรส_หย่า'] === 1) parts.push("หย่า");
        if (row['สถานภาพสมรส_หม้าย'] === 1) parts.push("หม้าย");
        if (row['สถานภาพสมรส_ไม่ทราบ'] === 1) parts.push("ไม่ทราบ");
        if (row['สถานภาพสมรส_ไม่กรอกข้อมูล/ว่าง'] === 1) parts.push("ไม่กรอกข้อมูล/ว่าง");
        return parts.length ? parts.join(' / ') : "ไม่ระบุ";
      }

      function combine_season(row) {
        const parts = [];
        if (row['ฤดูกาล_ฤดูหนาว'] === 1) parts.push("ฤดูหนาว");
        if (row['ฤดูกาล_ฤดูฝน'] === 1) parts.push("ฤดูฝน");
        if (row['ฤดูกาล_ฤดูร้อน'] === 1) parts.push("ฤดูร้อน");
        return parts.length ? parts.join(' / ') : "ไม่ระบุ";
      }

      function combine_age(row) {
        const parts = [];
        if (row['ช่วงอายุ_ผู้สูงอายุ'] === 1) parts.push("ผู้สูงอายุ");
        if (row['ช่วงอายุ_เด็ก'] === 1) parts.push("เด็ก");
        if (row['ช่วงอายุ_ผู้ใหญ่ตอนกลาง'] === 1) parts.push("ผู้ใหญ่ตอนกลาง");
        if (row['ช่วงอายุ_ผู้ใหญ่ตอนต้น'] === 1) parts.push("ผู้ใหญ่ตอนต้น");
        if (row['ช่วงอายุ_วัยรุ่น'] === 1) parts.push("วัยรุ่น");
        return parts.length ? parts.join(' / ') : "ไม่ระบุ";
      }

      function combine_income2(row) {
        const income = {

        }
      }

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

      function combine_subdistrict(row) {
        const subdistrict_map = {
          'ต.เวียง': 101,
          'ต.รอบเวียง': 102,
          'ต.บ้านดู่': 103,
          'ต.นางแล': 104,
          'ต.แม่ข้าวต้ม': 105,
          'ต.แม่ยาว': 106,
          'ต.สันทราย': 107,
          'ต.แม่กรณ์': 108,
          'ต.ห้วยชมภู': 109,
          'ต.ห้วยสัก': 110,
          'ต.ริมกก': 111,
          'ต.ดอยลาน': 112,
          'ต.ป่าอ้อดอนชัย': 113,
          'ต.ท่าสาย': 114,
          'ต.ดอยฮาง': 115,
          'ต.ท่าสุด': 116,
          'ต.เวียงชัย': 201,
          'ต.ผางาม': 202,
          'ต.เวียงเหนือ': 203,
          'ต.ดอนศิลา': 204,
          'ต.เมืองชุม': 205,
          'ต.สถาน': 302,
          'ต.ครึ่ง': 303,
          'ต.บุญเรือง': 304,
          'ต.ห้วยซ้อ': 305,
          'ต.ศรีดอนชัย': 306,
          'ต.ริมโขง': 307,
          'ต.งิ้ว': 402,
          'ต.ปล้อง': 403,
          'ต.แม่ลอย': 404,
          'ต.เชียงเคี่ยน': 405,
          'ต.ตับเต่า': 406,
          'ต.หงาว': 407,
          'ต.สันทรายงาม': 408,
          'ต.ศรีดอนไชย': 409,
          'ต.หนองแรด': 410,
          'ต.สันมะเค็ด': 501,
          'ต.แม่อ้อ': 502,
          'ต.ธารทอง': 503,
          'ต.สันติสุข': 504,
          'ต.ดอยงาม': 505,
          'ต.หัวง้ม': 506,
          'ต.เจริญเมือง': 507,
          'ต.ป่าหุ่ง': 508,
          'ต.ม่วงคำ': 509,
          'ต.ทรายขาว': 510,
          'ต.สันกลาง': 511,
          'ต.แม่เย็น': 512,
          'ต.เมืองพาน': 513,
          'ต.ทานตะวัน': 514,
          'ต.เวียงห้าว': 515,
          'ต.ป่าแดด': 601,
          'ต.ป่าแงะ': 602,
          'ต.สันมะค่า': 603,
          'ต.โรงช้าง': 604,
          'ต.ศรีโพธิ์เงิน': 605,
          'ต.แม่จัน': 701,
          'ต.จันจว้า': 702,
          'ต.แม่คำ': 703,
          'ต.ป่าซาง': 704,
          'ต.สันทราย': 705,
          'ต.ท่าข้าวเปลือก': 706,
          'ต.ป่าตึง': 707,
          'ต.แม่ไร่': 708,
          'ต.ศรีค้ำ': 709,
          'ต.จันจว้าใต้': 710,
          'ต.จอมสวรรค์': 711,
          'ต.ป่าสัก': 802,
          'ต.บ้านแซว': 803,
          'ต.ศรีดอนมูล': 804,
          'ต.แม่เงิน': 805,
          'ต.โยนก': 806,
          'ต.แม่สาย': 901,
          'ต.ห้วยไคร้': 902,
          'ต.เกาะช้าง': 903,
          'ต.โป่งผา': 904,
          'ต.ศรีเมืองชุม': 905,
          'ต.เวียงพางคำ': 906,
          'ต.บ้านด้าย': 907,
          'ต.โป่งงาม': 908,
          'ต.แม่สรวย': 1001,
          'ต.แม่พริก': 1003,
          'ต.ศรีถ้อย': 1004,
          'ต.ท่าก๊อ': 1005,
          'ต.วาวี': 1006,
          'ต.เจดีย์หลวง': 1007,
          'ต.สันสลี': 1101,
          'ต.บ้านโป่ง': 1103,
          'ต.ป่างิ้ว': 1104,
          'ต.เวียงกาหลง': 1105,
          'ต.แม่เจดีย์': 1106,
          'ต.แม่เจดีย์ใหม่': 1107,
          'ต.แม่เปา': 1201,
          'ต.แม่ต๋ำ': 1202,
          'ต.ไม้ยา': 1203,
          'ต.เม็งราย': 1204,
          'ต.ตาดควัน': 1205,
          'ต.ม่วงยาย': 1301,
          'ต.ปอ': 1302,
          'ต.หล่ายงาว': 1303,
          'ต.ท่าข้าม': 1304,
          'ต.ต้า': 1401,
          'ต.ป่าตาล': 1402,
          'ต.ยางฮอม': 1403,
          'ต.เทอดไทย': 1501,
          'ต.แม่สลองใน': 1502,
          'ต.แม่สลองนอก': 1503,
          'ต.แม่ฟ้าหลวง': 1504,
          'ต.ดงมะดะ': 1601,
          'ต.จอมหมอกแก้ว': 1602,
          'ต.บัวสลี': 1603,
          'ต.ป่าก่อดำ': 1604,
          'ต.โป่งแพร่': 1605,
          'ต.ทุ่งก่อ': 1701,
          'ต.ดงมหาวัน': 1702,
          'ต.ปงน้อย': 1801,
          'ต.โชคชัย': 1802,
          'ต.หนองป่าก่อ': 1803,
        }
        const name = row["Pro.ตำบล / แขวง"]?.trim();
        return subdistrict_map[name] || null;
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

      function map_gender(val) {
        if (val === 0) return "ชาย";
        if (val === 1) return "หญิง";
        return null;
      }

      results = results.map(row => ({
        id: row['ลำดับ'],
        gender: row['เพศ'],
        marital_status: row["สถานภาพสมรส"],
        monthly_income: row["ระดับรายได้"],
        season: row['ฤดูกาล'],
        age_range: row["ช่วงอายุ"],
        district_id: combine_district_from_string(row),
        subdistrict_id: combine_subdistrict(row),
        birth_date: combine_birth_date(row),
        province_id: 1,  // รหัสจังหวัดเชียงราย
        predict: row['predict'],

        // // แปลงฟีเจอร์อื่นๆ จาก ordinal_features (true/false = 1/0)
        // life_problems: row['ประสบปัญหาชีวิต'] || 0,
        // relationship_loss: row['สูญเสียความสัมพันธ์'] || 0,
        // in_debt: row['เป็นหนี้'] || 0,
        // conflict_with_significant: row['เกิดความขัดแย้งรุนแรงกับคนสำคัญในชีวิต'] || 0,
        // career_failure: row['ประสบความล้มเหลวในการงาน'] || 0,
        // public_shame: row['ถูกตำหนิให้อับอาย'] || 0,
        // health_problems: row['ปัญหาสุขภาพ'] || 0,
        // legal_issues: row['มีคดีความ'] || 0,
        // social_isolation: row['Social isolation'] || 0,
        // academic_failure: row['ล้มเหลวในการเรียน'] || 0,
        // violent_relationship: row['Violence relationship'] || 0,
        // psychiatric_trigger: row['ปัจจัยกระตุ้นอาการทางจิตเวชกำเริบ'] || 0,
        // depression: row['โรคซึมเศร้า'] || 0,
        // bipolar_disorder: row['โรคไบโพล่าร์'] || 0,
        // schizophrenia: row['โรคจิตเภท'] || 0,
        // personality_disorder: row['โรคบุคลิกภาพผิดปกติ'] || 0,
        // anxiety_disorder: row['โรควิตกังวล'] || 0,
        // substance_trigger: row['ปัจจัยกระตุ้นเกิดพิษหรือฤทธิ์สารเสพติดที่เสพ'] || 0,
        // suicide_news_trigger: row['ปัจจัยกระตุ้นจากรับรู้ข่าวการฆ่าตัวตาย'] || 0,
        // r1_psychiatric_illness: row['R1.ป่วยด้วยโรคจิตเวช'] || 0,
        // r1_depression: row['R1.โรคซึมเศร้า'] || 0,
        // r1_bipolar: row['R1.โรคไบโพล่าร์'] || 0,
        // r1_schizophrenia: row['R1.โรคจิตเภท'] || 0,
        // r1_personality_disorder: row['R1.โรคบุคลิกภาพผิดปกติ'] || 0,
        // r1_anxiety: row['R1.โรควิตกังวล'] || 0,
        // r2_alcohol_use: row['R2.ป่วยด้วยโรคติดสุรา'] || 0,
        // r3_substance_addiction: row['R3.ติดสารเสพติด'] || 0,
        // r4_physical_illness_risk: row['R4.ปัจจัยเสี่ยงโรคทางกาย'] || 0,
        // chronic_pain: row['โรคปวดเรื้อรัง'] || 0,
        // stroke_paralysis: row['อัมพาต/โรคหลอดเลือดสมอง'] || 0,
        // cancer: row['โรคมะเร็ง'] || 0,
        // chronic_liver_disease: row['โรคตับเรื้อรัง'] || 0,
        // chronic_kidney_failure: row['ไตวายเรื้อรัง'] || 0,
        // disability: row['พิการ'] || 0,
        // chronic_headache: row['ปวดศีรษะเรื้อรัง'] || 0,
        // heart_disease: row['โรคหัวใจ'] || 0,
        // hiv: row['โรคเอดส์/HIV'] || 0,
        // r5_personality_traits: row['R5.บุคลิกภาพ'] || 0,
        // r5a_impulsive: row['R5A.บุคลิกภาพหุนหันพลันแล่น (Impulsive)'] || 0,
        // r5b_perfectionist: row['R5B.นิยมความสมบูรณ์แบบ (Perfectionism)'] || 0,
        // r6_previous_suicide_attempt: row['R6.ตนเองเคยฆ่าตัวตาย'] || 0,
        // r7_family_suicide_history: row['R7.คนในครอบครัวเคยฆ่าตัวตาย'] || 0,
        // r8_childhood_trauma: row['R8.Childhood trauma'] || 0,
        // r9_personal_beliefs: row['R9.ค่านิยมความเชื่อส่วนบุคคล'] || 0,
        // prof1_personal: row['Prof1.ส่วนตัว'] || 0,
        // prof2_family: row['Prof2.ครอบครัว'] || 0,
        // prof3_friends: row['Prof3.เพื่อน'] || 0,
        // prof4_community: row['Prof4.ชุมชน'] || 0,
        // prof5_healthcare_access: row['Prof5.กาเข้าถึงบริการสุขภาพ'] || 0,
        // prof6_problem_solving_skills: row['Prof6.ทักษะการแก้ไขปัญหา'] || 0,
        // substance_control_barrier: row['ด่านกั้นควบคุมสารพิษ วัสดุอุปกรณ์ในครอบครัวหรือในพื้นที่'] || 0,
        // site_restriction_barrier: row['ด่านกั้นการปิดกั้นหรือเฝ้าระวังป้องกันสถานที่'] || 0,
        // suicide_warning_signs: row['สัญญาณเตือนการฆ่าตัวตาย'] || 0,
        // physical_injury_treatment: row['การรักษาอาการบาดเจ็บทางกาย'] || 0,
        // psychiatric_assessment: row['การตรวจประเมินตามมาตรฐานจิตเวชและการช่วยเหลือทางสังคมจิตใจ'] || 0,
        // crisis_intervention: row['การแก้ไขปัญหาหรือวิกฤติชีวิตที่เป็นปัจจัยกระตุ้น'] || 0,
        // risk_reduction: row['การลดหรือขจัดปัจจัยเสี่ยง'] || 0,
        // protective_factors: row['การสร้างและเสริมปัจจัยปกป้อง ระดับบุคคลและระดับครอบครัว'] || 0,
        // ongoing_support: row['การติดตามช่วยเหลือต่อเนื่องป้องกันการกระทำรุนแรงต่อตนเองซ้ำ'] || 0,
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