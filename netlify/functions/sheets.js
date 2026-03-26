const { google } = require('googleapis');

const SPREADSHEET_ID = '1pdW8Xif8ZA75UbkAAbnn02wosNbO5kNnmuJ462E-nqw';
const SHEET_NAMES = ['합의사항', '의사결정', '아이디어', '조사', '로드맵', '할일'];

function getAuth() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheets() {
  const auth = await getAuth();
  return google.sheets({ version: 'v4', auth });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const sheets = await getSheets();

    // GET: read all sheets
    if (event.httpMethod === 'GET') {
      const result = {};
      for (const name of SHEET_NAMES) {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId: SPREADSHEET_ID,
          range: `${name}!A1:Z100`,
        });
        result[name] = res.data.values || [];
      }
      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // POST: add row
    if (event.httpMethod === 'POST') {
      const { sheet, values } = JSON.parse(event.body);
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet}!A1`,
        valueInputOption: 'RAW',
        requestBody: { values: [values] },
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // PUT: update row
    if (event.httpMethod === 'PUT') {
      const { sheet, range, values } = JSON.parse(event.body);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet}!${range}`,
        valueInputOption: 'RAW',
        requestBody: { values: [values] },
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // DELETE: clear row
    if (event.httpMethod === 'DELETE') {
      const { sheet, range } = JSON.parse(event.body);
      await sheets.spreadsheets.values.clear({
        spreadsheetId: SPREADSHEET_ID,
        range: `${sheet}!${range}`,
      });
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
