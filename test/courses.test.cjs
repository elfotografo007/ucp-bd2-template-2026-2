const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { MongoClient, ObjectId } = require('mongodb');
const { randomUUID } = require('node:crypto');

let api;
let db;
const originalUri = process.env.MONGODB_URI;
const originalDb = process.env.MONGODB_DB;
const testUri = process.env.MONGODB_TEST_URI || originalUri || 'mongodb://127.0.0.1:27017';
const testDbName = `ucp_courses_test_${randomUUID().replaceAll('-', '')}`;
const client = new MongoClient(
  testUri,
  { serverSelectionTimeoutMS: 5000 },
);

before(async () => {
  await client.connect();
  db = client.db(testDbName);
  await db.createCollection('courses');
  process.env.MONGODB_URI = testUri;
  process.env.MONGODB_DB = testDbName;
});

beforeEach(async () => {
  await db.collection('courses').deleteMany({});
  delete require.cache[require.resolve('../server.cjs')];
  const app = require('../server.cjs');
  api = request(app);
});

after(async () => {
  try {
    if (db) await db.dropDatabase();
  } finally {
    if (originalUri === undefined) delete process.env.MONGODB_URI;
    else process.env.MONGODB_URI = originalUri;
    if (originalDb === undefined) delete process.env.MONGODB_DB;
    else process.env.MONGODB_DB = originalDb;
    await client.close();
  }
});

const student = { id: 'student-1', name: 'Ana García', email: 'ana@example.com' };
const course = { name: 'Bases de datos II', description: 'Bases documentales' };

async function create(body = course) {
  const response = await api.post('/courses').send(body)
    .expect(201).expect('Content-Type', /json/);
  assert.equal(typeof response.body.id, 'string');
  assert.ok(response.body.id.trim());
  assert.deepEqual(response.body, { ...body, students: body.students ?? [], id: response.body.id });
  return response.body;
}

function errorJson(response) {
  assert.equal(typeof response.body.message, 'string');
  assert.ok(response.body.message.trim());
}

test('GET /courses comienza con un arreglo vacío', async () => {
  const response = await api.get('/courses').expect(200).expect('Content-Type', /json/);
  assert.deepEqual(response.body, []);
});

test('POST crea cursos con IDs distintos y students vacío por defecto', async () => {
  const first = await create();
  const second = await create({ ...course, name: 'Programación' });
  assert.notEqual(first.id, second.id);
  const list = await api.get('/courses').expect(200).expect('Content-Type', /json/);
  assert.equal(list.body.length, 2);
  assert.deepEqual(list.body.find(item => item.id === first.id), first);
  assert.deepEqual(list.body.find(item => item.id === second.id), second);
});

test('POST guarda estudiantes embebidos y GET por ID los recupera', async () => {
  const saved = await create({ ...course, students: [student] });
  const response = await api.get(`/courses/${saved.id}`).expect(200).expect('Content-Type', /json/);
  assert.deepEqual(response.body, saved);
});

test('PUT actualiza los campos, conserva el ID y no modifica otro curso', async () => {
  const saved = await create();
  const other = await create({ ...course, name: 'Otro curso' });
  const updated = { name: 'Bases III', description: '', students: [student] };
  const response = await api.put(`/courses/${saved.id}`).send(updated)
    .expect(200).expect('Content-Type', /json/);
  assert.deepEqual(response.body, { id: saved.id, ...updated });
  const read = await api.get(`/courses/${saved.id}`).expect(200);
  assert.deepEqual(read.body, { id: saved.id, ...updated });
  const untouched = await api.get(`/courses/${other.id}`).expect(200);
  assert.deepEqual(untouched.body, other);
});

test('PUT permite agregar, editar y quitar estudiantes del curso', async () => {
  const saved = await create();
  const edited = { ...student, name: 'Ana María', email: 'ana.maria@example.com' };
  for (const students of [[student], [edited], []]) {
    const expected = { ...course, id: saved.id, students };
    const update = await api.put(`/courses/${saved.id}`).send({ ...course, students }).expect(200);
    assert.deepEqual(update.body, expected);
    const read = await api.get(`/courses/${saved.id}`).expect(200);
    assert.deepEqual(read.body, expected);
  }
});

test('DELETE elimina solo el curso indicado y responde sin cuerpo', async () => {
  const saved = await create({ ...course, students: [student] });
  const other = await create();
  const response = await api.delete(`/courses/${saved.id}`).expect(204);
  assert.equal(response.text, '');
  await api.get(`/courses/${saved.id}`).expect(404).expect('Content-Type', /json/).expect(errorJson);
  const list = await api.get('/courses').expect(200);
  assert.deepEqual(list.body, [other]);
});

for (const method of ['get', 'put', 'delete']) {
  test(`${method.toUpperCase()} devuelve 404 JSON si el curso no existe`, async () => {
    let pending = api[method]('/courses/507f1f77bcf86cd799439099');
    if (method === 'put') pending = pending.send({ ...course, students: [] });
    await pending.expect(404).expect('Content-Type', /json/).expect(errorJson);
  });
}

// Insertar directamente en MongoDB evita depender del endpoint POST.
test('GET /courses devuelve todos los documentos de MongoDB con sus estudiantes', async () => {
  await db.collection('courses').insertMany([
    {
      _id: new ObjectId('507f1f77bcf86cd799439011'),
      name: 'Bases de datos',
      description: 'Documentos en MongoDB',
      students: [{ id: 's1', name: 'Ana', email: 'ana@example.com' }],
    },
    {
      _id: new ObjectId('507f1f77bcf86cd799439012'),
      name: 'Programación',
      description: 'Introducción a Node.js',
      students: [],
    },
  ]);

  const response = await api.get('/courses').expect(200).expect('Content-Type', /json/);
  assert.ok(Array.isArray(response.body));
  // El contrato no exige un orden específico para listar.
  const items = response.body.sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(items, [
    {
      id: '507f1f77bcf86cd799439011',
      name: 'Bases de datos',
      description: 'Documentos en MongoDB',
      students: [{ id: 's1', name: 'Ana', email: 'ana@example.com' }],
    },
    {
      id: '507f1f77bcf86cd799439012',
      name: 'Programación',
      description: 'Introducción a Node.js',
      students: [],
    },
  ]);
});

test('GET /courses/:id devuelve el documento solicitado de MongoDB', async () => {
  await db.collection('courses').insertMany([
    {
      _id: new ObjectId('507f1f77bcf86cd799439011'),
      name: 'Otro curso',
      description: '',
      students: [],
    },
    {
      _id: new ObjectId('507f1f77bcf86cd799439012'),
      name: 'Curso solicitado',
      description: 'Estudiantes embebidos',
      students: [
        { id: 's1', name: 'Ana', email: 'ana@example.com' },
        { id: 's2', name: 'Luis', email: 'luis@example.com' },
      ],
    },
  ]);

  const response = await api.get('/courses/507f1f77bcf86cd799439012')
    .expect(200).expect('Content-Type', /json/);
  assert.deepEqual(response.body, {
    id: '507f1f77bcf86cd799439012',
    name: 'Curso solicitado',
    description: 'Estudiantes embebidos',
    students: [
      { id: 's1', name: 'Ana', email: 'ana@example.com' },
      { id: 's2', name: 'Luis', email: 'luis@example.com' },
    ],
  });
});
