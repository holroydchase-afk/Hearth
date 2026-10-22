// app.json plus one switch: HEARTH_BASE_URL serves the web export under a sub-path, so the public
// demo can live at chaseholroyd.com/demo/hearth/ (RR-5, scripts/build-demo.sh). Unset: app.json as is.
module.exports = ({ config }) =>
  process.env.HEARTH_BASE_URL
    ? { ...config, experiments: { ...config.experiments, baseUrl: process.env.HEARTH_BASE_URL } }
    : config;
