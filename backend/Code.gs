const SHEET_ID = '1etmK3TviMfcgjK1rZC2OHJ5-8ffI82uUROysgPZH6zI';
const DATA_SHEET_NAME = 'CATALOGO_ONLINE';
const WRITE_TOKEN = 'AVISO_DESMONTE_ADMIN_2026_08';

function doGet(event) {
  const payload = readCatalog_();
  const callback = String(event?.parameter?.callback || '');
  return respond_(payload, callback);
}
function doPost(event) {
  try {
    const body = parseBody_(event);
    if (body.action !== 'saveStructures') throw new Error('Ação não reconhecida.');
    if (body.token !== WRITE_TOKEN) throw new Error('Token de publicação inválido.');
    if (!Array.isArray(body.structures)) throw new Error('Catálogo inválido.');
    if (body.structures.length > 200) throw new Error('O catálogo excede o limite permitido.');
    const structures = body.structures.map(normalizeStructure_);
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const payload = writeCatalog_(structures);
      return respond_({ ok: true, ...payload });
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return respond_({ ok: false, error: String(error.message || error) });
  }
}

function setupCatalog() {
  writeCatalog_([
  {
    "id": "01",
    "name": "MINA",
    "statusFromPdf": "evacuar",
    "pageX": 574.390654,
    "pageY": 511.936805
  },
  {
    "id": "02",
    "name": "PILHA DE ESTÉRIL",
    "statusFromPdf": "evacuar",
    "pageX": 676.881432,
    "pageY": 356.883295
  },
  {
    "id": "03",
    "name": "PÁTIO SULFETADO",
    "statusFromPdf": "evacuar",
    "pageX": 419.299805,
    "pageY": 433.258253
  },
  {
    "id": "04",
    "name": "PLATÔ DE BRITAGEM",
    "statusFromPdf": "evacuar",
    "pageX": 427.32018,
    "pageY": 544.818012
  },
  {
    "id": "05",
    "name": "PÁTIO REFRATÁRIO",
    "statusFromPdf": "evacuar",
    "pageX": 466.532172,
    "pageY": 584.11219
  },
  {
    "id": "06",
    "name": "PÁTIO OXIDADO",
    "statusFromPdf": "evacuar",
    "pageX": 478.409698,
    "pageY": 712.721623
  },
  {
    "id": "07",
    "name": "POSTO DE COMBUSTÍVEL",
    "statusFromPdf": "evacuar",
    "pageX": 341.388787,
    "pageY": 448.366603
  },
  {
    "id": "08",
    "name": "ESCRITÓRIO R&D",
    "statusFromPdf": "evacuar",
    "pageX": 361.660786,
    "pageY": 473.41115
  },
  {
    "id": "09",
    "name": "GALPÃO DE GEOLOGIA",
    "statusFromPdf": "evacuar",
    "pageX": 361.660786,
    "pageY": 494.96981
  },
  {
    "id": "10",
    "name": "GALPÃO DE EXPLORAÇÃO",
    "statusFromPdf": "evacuar",
    "pageX": 368.306645,
    "pageY": 509.502847
  },
  {
    "id": "11",
    "name": "ESCRITÓRIO MINA",
    "statusFromPdf": "evacuar",
    "pageX": 331.254204,
    "pageY": 479.827452
  },
  {
    "id": "12",
    "name": "REFEITÓRIO R&D",
    "statusFromPdf": "evacuar",
    "pageX": 341.388787,
    "pageY": 488.46282
  },
  {
    "id": "13",
    "name": "ESTACIONAMENTO R&D",
    "statusFromPdf": "evacuar",
    "pageX": 337.795205,
    "pageY": 465.957586
  },
  {
    "id": "14",
    "name": "CMD",
    "statusFromPdf": "liberado",
    "pageX": 312.186679,
    "pageY": 472.464576
  },
  {
    "id": "15",
    "name": "ALMOXARIFADO",
    "statusFromPdf": "liberado",
    "pageX": 313.566864,
    "pageY": 498.248813
  },
  {
    "id": "16",
    "name": "PÁTIO DO ALMOXARIFADO",
    "statusFromPdf": "evacuar",
    "pageX": 334.680578,
    "pageY": 510.061154
  },
  {
    "id": "17",
    "name": "TK SOLUTION",
    "statusFromPdf": "evacuar",
    "pageX": 344.817994,
    "pageY": 539.098886
  },
  {
    "id": "18",
    "name": "RS OPERAÇÕES",
    "statusFromPdf": "evacuar",
    "pageX": 360.110556,
    "pageY": 530.97365
  },
  {
    "id": "19",
    "name": "RS LOCAÇÕES",
    "statusFromPdf": "evacuar",
    "pageX": 369.927725,
    "pageY": 543.701393
  },
  {
    "id": "20",
    "name": "PILHA DE EXPURGO",
    "statusFromPdf": "evacuar",
    "pageX": 368.306645,
    "pageY": 558.191918
  },
  {
    "id": "21",
    "name": "SUBSTAÇÃO DA BRITAGEM",
    "statusFromPdf": "evacuar",
    "pageX": 384.231202,
    "pageY": 582.264384
  },
  {
    "id": "22",
    "name": "OFICINA DE MANUTENÇÃO",
    "statusFromPdf": "liberado",
    "pageX": 306.405206,
    "pageY": 554.955427
  },
  {
    "id": "23",
    "name": "PILHA PULMÃO",
    "statusFromPdf": "evacuar",
    "pageX": 338.492383,
    "pageY": 559.759152
  },
  {
    "id": "24",
    "name": "SALA DE APOIO DA BRITAGEM",
    "statusFromPdf": "evacuar",
    "pageX": 374.725781,
    "pageY": 571.013184
  },
  {
    "id": "25",
    "name": "BRITADOR PRIMÁRIO",
    "statusFromPdf": "evacuar",
    "pageX": 405.084182,
    "pageY": 575.649701
  },
  {
    "id": "26",
    "name": "TANQUE ÁGUA NOVA",
    "statusFromPdf": "evacuar",
    "pageX": 366.305803,
    "pageY": 595.366224
  },
  {
    "id": "27",
    "name": "PILHA DE TRANSBORDO",
    "statusFromPdf": "liberado",
    "pageX": 335.788694,
    "pageY": 623.383694
  },
  {
    "id": "28",
    "name": "SUBESTAÇÃO PRINCIPAL",
    "statusFromPdf": "liberado",
    "pageX": 319.830127,
    "pageY": 603.083357
  },
  {
    "id": "29",
    "name": "C.T. BRIGADA",
    "statusFromPdf": "liberado",
    "pageX": 282.451488,
    "pageY": 604.772453
  },
  {
    "id": "30",
    "name": "REFEITÓRIO MVV",
    "statusFromPdf": "liberado",
    "pageX": 312.186679,
    "pageY": 575.320949
  },
  {
    "id": "31",
    "name": "VESTIÁRIO",
    "statusFromPdf": "liberado",
    "pageX": 319.062098,
    "pageY": 559.759152
  },
  {
    "id": "32",
    "name": "ADM",
    "statusFromPdf": "liberado",
    "pageX": 298.792934,
    "pageY": 576.066305
  },
  {
    "id": "33",
    "name": "C.T MVV",
    "statusFromPdf": "liberado",
    "pageX": 293.294866,
    "pageY": 588.244243
  },
  {
    "id": "34",
    "name": "AMBULATÓRIO",
    "statusFromPdf": "liberado",
    "pageX": 297.990895,
    "pageY": 563.366904
  },
  {
    "id": "35",
    "name": "LABORATÓRIO SGS",
    "statusFromPdf": "liberado",
    "pageX": 282.451488,
    "pageY": 561.604121
  },
  {
    "id": "36",
    "name": "MULTISERV",
    "statusFromPdf": "liberado",
    "pageX": 266.07263,
    "pageY": 568.92732
  },
  {
    "id": "37",
    "name": "ETE",
    "statusFromPdf": "liberado",
    "pageX": 259.63309,
    "pageY": 538.54908
  },
  {
    "id": "38",
    "name": "PAIOL",
    "statusFromPdf": "liberado",
    "pageX": 138.289041,
    "pageY": 364.492733
  },
  {
    "id": "39",
    "name": "C.T R&D",
    "statusFromPdf": "liberado",
    "pageX": 159.960212,
    "pageY": 282.927202
  },
  {
    "id": "40",
    "name": "ACESSO PRINCIPAL",
    "statusFromPdf": "evacuar",
    "pageX": 473.688161,
    "pageY": 324.042259,
    "lockMarkerPosition": true
  },
  {
    "id": "41",
    "name": "PORTARIA",
    "statusFromPdf": "liberado",
    "pageX": 549.13355,
    "pageY": 180.454277,
    "lockMarkerPosition": true
  },
  {
    "id": "42",
    "name": "ACESSO PORTARIA",
    "statusFromPdf": "evacuar",
    "pageX": 599.919032,
    "pageY": 202.426691,
    "classificationArea": {
      "catalogId": "evacuar",
      "entityIndex": 10
    },
    "lockMarkerPosition": true
  },
  {
    "id": "43",
    "name": "PILHA DE TOPSOIL",
    "statusFromPdf": "evacuar",
    "pageX": 404.5032,
    "pageY": 655.859136
  },
  {
    "id": "44",
    "name": "GALPÃO DE ESTOCAGEM",
    "statusFromPdf": "liberado",
    "pageX": 287.856314,
    "pageY": 519.719616
  },
  {
    "id": "45",
    "name": "GALPÃO DA FILTRAGEM",
    "statusFromPdf": "liberado",
    "pageX": 287.856314,
    "pageY": 530.933974
  },
  {
    "id": "46",
    "name": "SUBESTAÇÃO DA FILTRAGEM",
    "statusFromPdf": "liberado",
    "pageX": 290.429638,
    "pageY": 540.017122
  },
  {
    "id": "47",
    "name": "GALPÃO DE REAGENTES",
    "statusFromPdf": "liberado",
    "pageX": 305.101541,
    "pageY": 545.693734
  },
  {
    "id": "48",
    "name": "MOAGEM E FLOTAÇÃO",
    "statusFromPdf": "liberado",
    "pageX": 312.186679,
    "pageY": 537.251083
  },
  {
    "id": "49",
    "name": "SUBESTAÇÃO DA MOAGEM",
    "statusFromPdf": "liberado",
    "pageX": 316.53979,
    "pageY": 527.844852
  },
  {
    "id": "50",
    "name": "ÁREA DOS ESPESSADORES",
    "statusFromPdf": "liberado",
    "pageX": 302.052098,
    "pageY": 522.309943
  },
  {
    "id": "51",
    "name": "BRITAGEM TERCEÁRIA",
    "statusFromPdf": "evacuar",
    "pageX": 355.567567,
    "pageY": 572.858155
  },
  {
    "id": "52",
    "name": "BRITAGEM SECUNDÁRIA",
    "statusFromPdf": "evacuar",
    "pageX": 394.365785,
    "pageY": 598.571539
  },
  {
    "id": "53",
    "name": "OPERAÇÃO ADM",
    "statusFromPdf": "liberado",
    "pageX": 325.373539,
    "pageY": 545.693734
  },
  {
    "id": "54",
    "name": "TEIXEIRA GUINDASTES",
    "statusFromPdf": "evacuar",
    "pageX": 351.883294,
    "pageY": 516.59082
  },
  {
    "id": "55",
    "name": "FM2C",
    "statusFromPdf": "evacuar",
    "pageX": 354.453782,
    "pageY": 552.11287
  }
]);
}

function parseBody_(event) {
  const raw = event?.parameter?.payload || event?.postData?.contents || '{}';
  return JSON.parse(raw);
}

function normalizeStructure_(structure) {
  const result = {
    id: String(structure.id || '').replace(/^structure-/, ''),
    name: String(structure.name || 'ESTRUTURA').trim().slice(0, 70) || 'ESTRUTURA',
    statusFromPdf: String(structure.statusFromPdf || 'liberado'),
    pageX: numberOrNull_(structure.pageX),
    pageY: numberOrNull_(structure.pageY),
    worldX: numberOrNull_(structure.worldX),
    worldY: numberOrNull_(structure.worldY),
    lockMarkerPosition: Boolean(structure.lockMarkerPosition)
  };
  if (structure.classificationArea && typeof structure.classificationArea === 'object') {
    result.classificationArea = {
      catalogId: String(structure.classificationArea.catalogId || ''),
      entityIndex: Number(structure.classificationArea.entityIndex)
    };
  }
  return result;
}

function numberOrNull_(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readCatalog_() {
  const properties = PropertiesService.getScriptProperties();
  const stored = properties.getProperty('catalogPayload');
  if (stored) return JSON.parse(stored);
  return writeCatalog_([
  {
    "id": "01",
    "name": "MINA",
    "statusFromPdf": "evacuar",
    "pageX": 574.390654,
    "pageY": 511.936805
  },
  {
    "id": "02",
    "name": "PILHA DE ESTÉRIL",
    "statusFromPdf": "evacuar",
    "pageX": 676.881432,
    "pageY": 356.883295
  },
  {
    "id": "03",
    "name": "PÁTIO SULFETADO",
    "statusFromPdf": "evacuar",
    "pageX": 419.299805,
    "pageY": 433.258253
  },
  {
    "id": "04",
    "name": "PLATÔ DE BRITAGEM",
    "statusFromPdf": "evacuar",
    "pageX": 427.32018,
    "pageY": 544.818012
  },
  {
    "id": "05",
    "name": "PÁTIO REFRATÁRIO",
    "statusFromPdf": "evacuar",
    "pageX": 466.532172,
    "pageY": 584.11219
  },
  {
    "id": "06",
    "name": "PÁTIO OXIDADO",
    "statusFromPdf": "evacuar",
    "pageX": 478.409698,
    "pageY": 712.721623
  },
  {
    "id": "07",
    "name": "POSTO DE COMBUSTÍVEL",
    "statusFromPdf": "evacuar",
    "pageX": 341.388787,
    "pageY": 448.366603
  },
  {
    "id": "08",
    "name": "ESCRITÓRIO R&D",
    "statusFromPdf": "evacuar",
    "pageX": 361.660786,
    "pageY": 473.41115
  },
  {
    "id": "09",
    "name": "GALPÃO DE GEOLOGIA",
    "statusFromPdf": "evacuar",
    "pageX": 361.660786,
    "pageY": 494.96981
  },
  {
    "id": "10",
    "name": "GALPÃO DE EXPLORAÇÃO",
    "statusFromPdf": "evacuar",
    "pageX": 368.306645,
    "pageY": 509.502847
  },
  {
    "id": "11",
    "name": "ESCRITÓRIO MINA",
    "statusFromPdf": "evacuar",
    "pageX": 331.254204,
    "pageY": 479.827452
  },
  {
    "id": "12",
    "name": "REFEITÓRIO R&D",
    "statusFromPdf": "evacuar",
    "pageX": 341.388787,
    "pageY": 488.46282
  },
  {
    "id": "13",
    "name": "ESTACIONAMENTO R&D",
    "statusFromPdf": "evacuar",
    "pageX": 337.795205,
    "pageY": 465.957586
  },
  {
    "id": "14",
    "name": "CMD",
    "statusFromPdf": "liberado",
    "pageX": 312.186679,
    "pageY": 472.464576
  },
  {
    "id": "15",
    "name": "ALMOXARIFADO",
    "statusFromPdf": "liberado",
    "pageX": 313.566864,
    "pageY": 498.248813
  },
  {
    "id": "16",
    "name": "PÁTIO DO ALMOXARIFADO",
    "statusFromPdf": "evacuar",
    "pageX": 334.680578,
    "pageY": 510.061154
  },
  {
    "id": "17",
    "name": "TK SOLUTION",
    "statusFromPdf": "evacuar",
    "pageX": 344.817994,
    "pageY": 539.098886
  },
  {
    "id": "18",
    "name": "RS OPERAÇÕES",
    "statusFromPdf": "evacuar",
    "pageX": 360.110556,
    "pageY": 530.97365
  },
  {
    "id": "19",
    "name": "RS LOCAÇÕES",
    "statusFromPdf": "evacuar",
    "pageX": 369.927725,
    "pageY": 543.701393
  },
  {
    "id": "20",
    "name": "PILHA DE EXPURGO",
    "statusFromPdf": "evacuar",
    "pageX": 368.306645,
    "pageY": 558.191918
  },
  {
    "id": "21",
    "name": "SUBSTAÇÃO DA BRITAGEM",
    "statusFromPdf": "evacuar",
    "pageX": 384.231202,
    "pageY": 582.264384
  },
  {
    "id": "22",
    "name": "OFICINA DE MANUTENÇÃO",
    "statusFromPdf": "liberado",
    "pageX": 306.405206,
    "pageY": 554.955427
  },
  {
    "id": "23",
    "name": "PILHA PULMÃO",
    "statusFromPdf": "evacuar",
    "pageX": 338.492383,
    "pageY": 559.759152
  },
  {
    "id": "24",
    "name": "SALA DE APOIO DA BRITAGEM",
    "statusFromPdf": "evacuar",
    "pageX": 374.725781,
    "pageY": 571.013184
  },
  {
    "id": "25",
    "name": "BRITADOR PRIMÁRIO",
    "statusFromPdf": "evacuar",
    "pageX": 405.084182,
    "pageY": 575.649701
  },
  {
    "id": "26",
    "name": "TANQUE ÁGUA NOVA",
    "statusFromPdf": "evacuar",
    "pageX": 366.305803,
    "pageY": 595.366224
  },
  {
    "id": "27",
    "name": "PILHA DE TRANSBORDO",
    "statusFromPdf": "liberado",
    "pageX": 335.788694,
    "pageY": 623.383694
  },
  {
    "id": "28",
    "name": "SUBESTAÇÃO PRINCIPAL",
    "statusFromPdf": "liberado",
    "pageX": 319.830127,
    "pageY": 603.083357
  },
  {
    "id": "29",
    "name": "C.T. BRIGADA",
    "statusFromPdf": "liberado",
    "pageX": 282.451488,
    "pageY": 604.772453
  },
  {
    "id": "30",
    "name": "REFEITÓRIO MVV",
    "statusFromPdf": "liberado",
    "pageX": 312.186679,
    "pageY": 575.320949
  },
  {
    "id": "31",
    "name": "VESTIÁRIO",
    "statusFromPdf": "liberado",
    "pageX": 319.062098,
    "pageY": 559.759152
  },
  {
    "id": "32",
    "name": "ADM",
    "statusFromPdf": "liberado",
    "pageX": 298.792934,
    "pageY": 576.066305
  },
  {
    "id": "33",
    "name": "C.T MVV",
    "statusFromPdf": "liberado",
    "pageX": 293.294866,
    "pageY": 588.244243
  },
  {
    "id": "34",
    "name": "AMBULATÓRIO",
    "statusFromPdf": "liberado",
    "pageX": 297.990895,
    "pageY": 563.366904
  },
  {
    "id": "35",
    "name": "LABORATÓRIO SGS",
    "statusFromPdf": "liberado",
    "pageX": 282.451488,
    "pageY": 561.604121
  },
  {
    "id": "36",
    "name": "MULTISERV",
    "statusFromPdf": "liberado",
    "pageX": 266.07263,
    "pageY": 568.92732
  },
  {
    "id": "37",
    "name": "ETE",
    "statusFromPdf": "liberado",
    "pageX": 259.63309,
    "pageY": 538.54908
  },
  {
    "id": "38",
    "name": "PAIOL",
    "statusFromPdf": "liberado",
    "pageX": 138.289041,
    "pageY": 364.492733
  },
  {
    "id": "39",
    "name": "C.T R&D",
    "statusFromPdf": "liberado",
    "pageX": 159.960212,
    "pageY": 282.927202
  },
  {
    "id": "40",
    "name": "ACESSO PRINCIPAL",
    "statusFromPdf": "evacuar",
    "pageX": 473.688161,
    "pageY": 324.042259,
    "lockMarkerPosition": true
  },
  {
    "id": "41",
    "name": "PORTARIA",
    "statusFromPdf": "liberado",
    "pageX": 549.13355,
    "pageY": 180.454277,
    "lockMarkerPosition": true
  },
  {
    "id": "42",
    "name": "ACESSO PORTARIA",
    "statusFromPdf": "evacuar",
    "pageX": 599.919032,
    "pageY": 202.426691,
    "classificationArea": {
      "catalogId": "evacuar",
      "entityIndex": 10
    },
    "lockMarkerPosition": true
  },
  {
    "id": "43",
    "name": "PILHA DE TOPSOIL",
    "statusFromPdf": "evacuar",
    "pageX": 404.5032,
    "pageY": 655.859136
  },
  {
    "id": "44",
    "name": "GALPÃO DE ESTOCAGEM",
    "statusFromPdf": "liberado",
    "pageX": 287.856314,
    "pageY": 519.719616
  },
  {
    "id": "45",
    "name": "GALPÃO DA FILTRAGEM",
    "statusFromPdf": "liberado",
    "pageX": 287.856314,
    "pageY": 530.933974
  },
  {
    "id": "46",
    "name": "SUBESTAÇÃO DA FILTRAGEM",
    "statusFromPdf": "liberado",
    "pageX": 290.429638,
    "pageY": 540.017122
  },
  {
    "id": "47",
    "name": "GALPÃO DE REAGENTES",
    "statusFromPdf": "liberado",
    "pageX": 305.101541,
    "pageY": 545.693734
  },
  {
    "id": "48",
    "name": "MOAGEM E FLOTAÇÃO",
    "statusFromPdf": "liberado",
    "pageX": 312.186679,
    "pageY": 537.251083
  },
  {
    "id": "49",
    "name": "SUBESTAÇÃO DA MOAGEM",
    "statusFromPdf": "liberado",
    "pageX": 316.53979,
    "pageY": 527.844852
  },
  {
    "id": "50",
    "name": "ÁREA DOS ESPESSADORES",
    "statusFromPdf": "liberado",
    "pageX": 302.052098,
    "pageY": 522.309943
  },
  {
    "id": "51",
    "name": "BRITAGEM TERCEÁRIA",
    "statusFromPdf": "evacuar",
    "pageX": 355.567567,
    "pageY": 572.858155
  },
  {
    "id": "52",
    "name": "BRITAGEM SECUNDÁRIA",
    "statusFromPdf": "evacuar",
    "pageX": 394.365785,
    "pageY": 598.571539
  },
  {
    "id": "53",
    "name": "OPERAÇÃO ADM",
    "statusFromPdf": "liberado",
    "pageX": 325.373539,
    "pageY": 545.693734
  },
  {
    "id": "54",
    "name": "TEIXEIRA GUINDASTES",
    "statusFromPdf": "evacuar",
    "pageX": 351.883294,
    "pageY": 516.59082
  },
  {
    "id": "55",
    "name": "FM2C",
    "statusFromPdf": "evacuar",
    "pageX": 354.453782,
    "pageY": 552.11287
  }
]);
}

function writeCatalog_(structures) {
  const normalized = structures.map(normalizeStructure_);
  const savedAt = new Date().toISOString();
  const revision = Utilities.getUuid();
  const payload = { ok: true, version: 1, revision, savedAt, structures: normalized };
  PropertiesService.getScriptProperties().setProperty('catalogPayload', JSON.stringify(payload));
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  const sheet = spreadsheet.getSheetByName(DATA_SHEET_NAME) || spreadsheet.insertSheet(DATA_SHEET_NAME);
  const rows = [
    ['id', 'name', 'statusFromPdf', 'pageX', 'pageY', 'worldX', 'worldY', 'lockMarkerPosition', 'classificationArea'],
    ...normalized.map((structure) => [
      structure.id,
      structure.name,
      structure.statusFromPdf,
      structure.pageX,
      structure.pageY,
      structure.worldX,
      structure.worldY,
      structure.lockMarkerPosition,
      structure.classificationArea ? JSON.stringify(structure.classificationArea) : ''
    ])
  ];
  sheet.clearContents();
  sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
  sheet.setFrozenRows(1);
  return payload;
}

function respond_(payload, callback) {
  const safeJson = JSON.stringify(payload).replace(/</g, '\\u003c');
  if (/^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + '(' + safeJson + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(safeJson).setMimeType(ContentService.MimeType.JSON);
}
