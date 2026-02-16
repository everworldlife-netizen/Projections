const express = require('express');
const path = require('path');
const routes = require('./src/routes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/picoclaw', express.static(path.join(__dirname, 'picoclaw')));
app.use('/api', routes);

app.listen(PORT, () => {
  console.log(`NBA Projections running on http://localhost:${PORT}`);
  console.log(`PicoClaw Dashboard at http://localhost:${PORT}/picoclaw/`);
});
