const mongoose = require("mongoose");

const LoaiSanPhamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    mota: { type: String, trim: true },
    image: [{ type: String, default: [] }],

    // Độ ưu tiên: số nhỏ sẽ hiển thị trước
    priority: { type: Number, default: 999 },

    // Danh sách các loại con (liên kết tới collection LoaiSanPhamCon)
    loaiCon: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LoaiSanPhamCon",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("LoaiSanPham", LoaiSanPhamSchema);
