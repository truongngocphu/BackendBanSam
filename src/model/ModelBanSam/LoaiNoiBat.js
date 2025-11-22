const mongoose = require("mongoose");

const LoaiNoiBatSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
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

    // ⭐ THÊM TRƯỜNG ƯU TIÊN
    priority: {
      type: Number,
      default: 999,
    }
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("LoaiNoiBat", LoaiNoiBatSchema);
