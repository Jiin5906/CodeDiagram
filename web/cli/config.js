'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');

const CONFIG_PATH = path.join(os.homedir(), '.codediagram_config.json');

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (_) {
    return {};
  }
}

//기존 설정에 data를 병합해 저장한다.
function saveConfig(data) {
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); } catch (_) {}
  fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...existing, ...data }, null, 2));
}

module.exports = { loadConfig, saveConfig };
