const express = require('express');
const axios = require('axios');
const ExcelJS = require('exceljs');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// --- تنظیمات ---
const API_URL = 'https://apishop.irancell.ir/shop/api/v2/search_msisdns';
const EXCEL_OUTPUT_PATH = path.join(__dirname, 'irancell_905_all_numbers.xlsx');
const TARGET_PREFIX = '905';
const PAGE_SIZE = 100;
const DB_PATH = path.join(__dirname, 'scrap_data.db');

// --- راه‌اندازی سرور ---
const app = express();
const PORT = 3000;

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// --- راه‌اندازی دیتابیس ---
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ خطا در اتصال به دیتابیس:', err.message);
    } else {
        console.log('✅ متصل به دیتابیس SQLite');
        db.run(`CREATE TABLE IF NOT EXISTS stats (
            id INTEGER PRIMARY KEY,
            total_numbers INTEGER DEFAULT 0,
            last_updated TEXT
        )`);
        
        db.run(`CREATE TABLE IF NOT EXISTS errors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            error_message TEXT,
            timestamp_ir TEXT,
            numbers_count_at_error INTEGER DEFAULT 0,
            wait_duration_seconds INTEGER DEFAULT 0
        )`);
    }
});

// --- توابع کمکی ---

function toJalaali(gy, gm, gd) {
    var g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    var jy = (gy <= 1600) ? 0 : 979;
    gy -= (gy <= 1600) ? 621 : 1600;
    var gy2 = (gm > 2) ? (gy + 1) : gy;
    var days = 365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) + Math.floor((gy2 + 399) / 400) - 80 + gd + g_d_m[gm - 1];
    jy += 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
        jy += Math.floor((days - 1) / 365);
        days = (days - 1) % 365;
    }
    var jm = (days < 186) ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    var jd = 1 + ((days < 186) ? (days % 31) : ((days - 186) % 30));
    return { jy: jy, jm: jm, jd: jd };
}

function getPersianDateTime() {
    const now = new Date();
    const jDate = toJalaali(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const h = now.getHours().toString().padStart(2, '0');
    const m = now.getMinutes().toString().padStart(2, '0');
    const s = now.getSeconds().toString().padStart(2, '0');
    return `${jDate.jy}/${jDate.jm.toString().padStart(2, '0')}/${jDate.jd.toString().padStart(2, '0')} ${h}:${m}:${s}`;
}

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// --- منطق اسکرپینگ ---
async function fetchAllNumbers() {
    let totalPages = 0;
    let offset = 0;
    let totalScrapedCount = 0;

    console.log('🚀 شروع فرآیند دریافت تمام شماره‌های 905...');
    const allNumbers = [];

    while (true) {
        console.log(`📡 در حال دریافت صفحه ${totalPages + 1} (Offset: ${offset})...`);

        const requestBody = {
            channel: "eShop",
            productId: 157,
            pattern: "905*******",
            offset: offset
        };

        try {
            const response = await axios.post(API_URL, requestBody, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Referer': 'https://shop.irancell.ir/',
                    'Origin': 'https://shop.irancell.ir'
                },
                timeout: 15000
            });

            if (response.data.result_code !== 0) {
                const errorMsg = response.data.info?.fa?.message || 'خطای نامشخص از سرور';
                console.error('❌ خطا از سمت سرور:', errorMsg);
                
                // ✅ اصلاح: پاس دادن totalScrapedCount به تابع ذخیره خطا
                saveErrorToDB(`result code:${response.data.result_code}, message: ${errorMsg}` , 0, totalScrapedCount);

                if (errorMsg.includes("تعداد تلاش های غیرمجاز")) {
                    console.log('⏳ مسدود موقت. در حال صبر کردن ۶۰ ثانیه...');
                    // ✅ اصلاح: پاس دادن waitDuration و count
                    saveErrorToDB('مسدودیت موقت (تعداد تلاش غیرمجاز)', 60, totalScrapedCount);
                    await delay(60000);
                    continue;
                }
                break;
            } ///NJmJnJAhlj

            const rawNumbers = response.data.numbers;
            if (!rawNumbers || rawNumbers.length === 0) {
                console.log('✅ دریافت تمام شماره‌ها به پایان رسید.');
                break;
            }

            const processedPage = rawNumbers.map(raw => {
                let cleanMsisdn = raw.replace(/[^0-9]/g, '');
                if (cleanMsisdn.startsWith('9')) {
                    cleanMsisdn = '0' + cleanMsisdn;
                }
                return {
                    msisdn: cleanMsisdn,
                    price: "تعیین نشده",
                    status: "موجود"
                };
            });

            const filteredPage = processedPage.filter(item => item.msisdn.startsWith('0905'));
            
            allNumbers.push(...filteredPage);
            totalScrapedCount += filteredPage.length;
            
            updateStatsInDB(totalScrapedCount);

            if (filteredPage.length < PAGE_SIZE) {
                console.log('✅ آخرین صفحه دریافت شد.');
            }

            totalPages++;
            offset += PAGE_SIZE;

        } catch (error) {
            let errorMsg = error.message;
            let waitDuration = 0;

            if (error.response && error.response.status === 429) {
                errorMsg = 'محدودیت نرخ (429)';
                waitDuration = 65;
                console.log('⏳ محدودیت نرخ (429). در حال صبر کردن 65 ثانیه...');
                // ✅ اصلاح: پاس دادن totalScrapedCount
                saveErrorToDB(errorMsg, waitDuration, totalScrapedCount);
                await delay(65000);
                continue;
            }

            if (error.code === 'ECONNABORTED') {
                errorMsg = 'درخواست منقضی شد (Timeout)';
                waitDuration = 30;
                console.log('⏳ درخواست منقضی شد. در حال صبر کردن ۳۰ ثانیه...');
                // ✅ اصلاح: پاس دادن totalScrapedCount
                saveErrorToDB(errorMsg, waitDuration, totalScrapedCount);
                await delay(30000);
                continue;
            }

            errorMsg = `خطای کلی: ${error.message}`;
            waitDuration = 5;
            console.error('❌ خطای عمومی:', error.message);
            // ✅ اصلاح: پاس دادن totalScrapedCount
            saveErrorToDB(errorMsg, waitDuration, totalScrapedCount);
            
            await delay(5000);
        }

        await delay(2000);
    }

    console.log(`📊 مجموع شماره‌های 905 پیدا شده: ${totalScrapedCount}`);
    updateStatsInDB(totalScrapedCount);

    if (allNumbers.length > 0) {
        writeNumbersToExcel(allNumbers);
    } else {
        console.log('هیچ شماره‌ای یافت نشد.');
    }
}

// ✅ اصلاح: اضافه کردن پارامتر currentCount
function saveErrorToDB(message, waitSeconds, currentCount) {
    const persianTime = getPersianDateTime();
    db.run(`INSERT INTO errors (error_message, timestamp_ir, numbers_count_at_error, wait_duration_seconds) VALUES (?, ?, ?, ?)`, 
        [message, persianTime, currentCount, waitSeconds], (err) => {
        if (err) console.error('خطا در ذخیره خطا:', err);
    });
}

function updateStatsInDB(count) {
    const persianTime = getPersianDateTime();
    db.run(`INSERT OR REPLACE INTO stats (id, total_numbers, last_updated) VALUES (1, ?, ?)`, [count, persianTime], (err) => {
        if (err) console.error('خطا در ذخیره آمار:', err);
    });
}

async function writeNumbersToExcel(numbers) {
    console.log('📝 در حال ایجاد فایل اکسل نهایی...');
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('شماره‌های 905');
    worksheet.columns = [
        { header: 'شماره تلفن', key: 'msisdn', width: 20 },
        { header: 'قیمت', key: 'price', width: 15 },
        { header: 'وضعیت', key: 'status', width: 15 }
    ];
    numbers.forEach(row => {
        worksheet.addRow(row);
    });
    await workbook.xlsx.writeFile(EXCEL_OUTPUT_PATH);
    console.log(`✅ فایل اکسل با ${numbers.length} شماره در مسیر "${EXCEL_OUTPUT_PATH}" ذخیره شد.`);
}

// --- روت‌های وب ---

app.get('/', (req, res) => {
    let totalNumbers = 0;
    let lastUpdated = '-';
    const errors = [];

    db.get("SELECT * FROM stats WHERE id = 1", [], (err, row) => {
        if (err) {
            console.error(err);
        } else if (row) {
            totalNumbers = row.total_numbers;
            lastUpdated = row.last_updated;
        }
    });

    db.all("SELECT * FROM errors ORDER BY id DESC", [], (err, rows) => {
        if (err) {
            console.error(err);
        } else if (rows) {
            errors.push(...rows);
        }

        res.render('index', {
            totalNumbers: totalNumbers,
            lastUpdated: lastUpdated,
            errors: errors
        });
    });
});

app.listen(PORT, () => {
    console.log(`🌐 سرور روی http://localhost:${PORT} در حال اجراست.`);
    fetchAllNumbers();
});