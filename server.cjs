// Instalar dependencias: pnpm add express
// Iniciar el servidor: pnpm exec node --watch server.cjs

const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Listar cursos.
app.get('/courses', (req, res) => {
  // TODO: consultar y retornar los cursos (200).
  res.status(501).json({ message: 'Listar cursos: pendiente de implementar' });
});

// Consultar un curso por ID.
app.get('/courses/:id', (req, res) => {
  console.log(req.params.id);
  // TODO: buscar req.params.id y retornar el curso (200) o no encontrado (404).
  res.status(501).json({ message: 'Consultar curso: pendiente de implementar' });
});

// Crear un curso.
app.post('/courses', (req, res) => {
  // TODO: validar req.body, crear el curso y retornarlo (201).
  res.status(501).json({ message: 'Crear curso: pendiente de implementar' });
});

// Actualizar un curso.
app.put('/courses/:id', (req, res) => {
  console.log(req.params.id);
  // TODO: validar req.body y actualizar el curso con req.params.id (200 o 404).
  res.status(501).json({ message: 'Actualizar curso: pendiente de implementar' });
});

// Eliminar un curso.
app.delete('/courses/:id', (req, res) => {
  console.log(req.params.id);
  // TODO: eliminar el curso con req.params.id (204 sin cuerpo o 404).
  res.status(501).json({ message: 'Eliminar curso: pendiente de implementar' });
});

// Al importar la app en las pruebas, no iniciar el servidor principal.
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Servidor disponible en http://localhost:${PORT}`);
  });
}

module.exports = app;
