// models/ThuongHieu.js
const mongoose = require("mongoose");

const ThuongHieuSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    mota: {
      type: String,
      trim: true,
      default: "",
    },
    image: {
      type: String,
      trim: true,
      default: "",
    },

    // ⭐ THÊM PRIORITY
    priority: {
      type: Number,
      default: 999, // mục nào không nhập sẽ đứng cuối
      min: 1,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ThuongHieu", ThuongHieuSchema);
