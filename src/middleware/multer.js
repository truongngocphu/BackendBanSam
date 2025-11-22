// src/middlewares/multer.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// --- Thư mục lưu trữ ---
const uploadDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// --- Cấu hình lưu file ---
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

// --- Filter file theo loại ---
const fileFilter = (req, file, cb) => {
  // Chỉ chấp nhận image/audio/video
  const filetypes = /jpeg|jpg|png|webp|gif|mp3|wav|mp4|mov/;
  const extname = filetypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = filetypes.test(file.mimetype);
  if (mimetype && extname) {
    return cb(null, true);
  }
  cb(new Error("File type không hợp lệ!"));
};

// --- Tạo instance multer ---
const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

module.exports = upload;
