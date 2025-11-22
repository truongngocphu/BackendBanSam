const express = require("express");
const router = express.Router();
const { protect } = require("../../middleware/authMiddleware");
const { taoDonHang, layDonHangNguoiDung, layTatCaDonHang, layChiTietDonHang, capNhatTrangThaiDon, xoaDonHang,  } = require("../../controllers/controller_TMDT/CRUD/donHangController");

// 🧾 Người dùng
router.post("/", protect, taoDonHang);
router.get("/me", protect, layDonHangNguoiDung);

// 🧾 Admin
router.get("/", protect, layTatCaDonHang);
router.get("/:maDonHang", protect, layChiTietDonHang);
router.put("/:maDonHang", protect, capNhatTrangThaiDon);
router.delete("/:maDonHang", protect, xoaDonHang);



module.exports = router;
