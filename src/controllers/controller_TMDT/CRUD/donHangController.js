const { default: mongoose } = require("mongoose");
const DonHang = require("../../../model/ModelBanSam/DonHang");
const GioHang = require("../../../model/ModelBanSam/GioHang");
const HangTV = require("../../../model/ModelBanSam/HangTV");
const NguoiDung = require("../../../model/ModelBanSam/NguoiDung");
const SanPham = require("../../../model/ModelBanSam/SanPham");
const nodemailer = require("nodemailer");
require('dotenv').config();


// Hàm helper định dạng tiền tệ VNĐ (có làm tròn)
const formatCurrency = (n) =>
  Math.round(n)
    .toLocaleString("vi-VN", { style: "currency", currency: "VND" });

// hàm hỗ trợ
async function capNhatHangThanhVien(userId) {
  try {
    // 1. Lấy tổng chi tiêu của người dùng
    const user = await NguoiDung.findById(userId).select("thongKe.tongTienDaMua");
    if (!user) return; // Không tìm thấy user

    const tongTienDaMua = user.thongKe.tongTienDaMua || 0;

    // 2. Lấy tất cả các hạng, sắp xếp từ CAO xuống THẤP
    // (Để đảm bảo người dùng nhận được hạng cao nhất họ đủ điều kiện)
    const allRanks = await HangTV.find({}).sort({ dieuKienTieuThu: -1 });

    let newRankId = null;

    // 3. Tìm hạng cao nhất mà người dùng đạt được
    for (const rank of allRanks) {
      if (tongTienDaMua >= rank.dieuKienTieuThu) {
        newRankId = rank._id;
        break; // Đã tìm thấy hạng cao nhất, dừng vòng lặp
      }
    }

    // 4. Cập nhật hạng mới cho người dùng
    await NguoiDung.findByIdAndUpdate(userId, {
      $set: { hangThanhVien: newRankId },
    });
  } catch (error) {
    // Ghi log lỗi nhưng không làm dừng quy trình chính
    console.error(`Lỗi khi cập nhật hạng thành viên cho user ${userId}:`, error.message);
  }
}

// 🟢 Tạo đơn hàng từ giỏ hàng
exports.taoDonHang = async (req, res) => {
  try {
    const userId = req.user._id;
    const { thongTinGiaoHang, phiGiaoHang, maKhuyenMai } = req.body;

    // 🔹 Lấy giỏ hàng người dùng
    const gio = await GioHang.findOne({ nguoiDung: userId })
      .populate({
        path: "sanPhams.sanPham",
      })
      .populate("appliedVoucher");

    if (!gio || gio.sanPhams.length === 0)
      return res
        .status(400)
        .json({ success: false, message: "Giỏ hàng trống, không thể đặt hàng!" });

    // 🔹 Chuyển sản phẩm trong giỏ hàng sang snapshot
    const sanPhamsSnapshot = gio.sanPhams.map((item) => {
      const sp = item.sanPham;
      const donGiaSauGiam = sp.giaBan * (1 - (sp.phanTramGiam || 0) / 100);
      return {
        sanPhamId: sp._id,
        tenSP: sp.name,
        hinhAnh: Array.isArray(sp.hinhAnh) ? [sp.hinhAnh[0]] : [sp.hinhAnh],
        giaBan: sp.giaBan,
        phanTramGiam: sp.phanTramGiam,
        giaSauGiam: donGiaSauGiam,
        soLuong: item.soLuong,
        thanhTien: donGiaSauGiam * item.soLuong,
      };
    });

    const tongTienHang = Math.round(
        sanPhamsSnapshot.reduce((acc, sp) => acc + sp.thanhTien, 0)
    );
    // 🔹 Lấy giảm giá (nếu có)
    const giamGia = gio.discountAmount || 0;

    const tongThanhToan = Math.round(tongTienHang - giamGia + (phiGiaoHang || 0));

    // 🔹 Tạo đơn hàng
    const donHang = new DonHang({
      nguoiDung: userId,
      sanPhams: sanPhamsSnapshot,
      tongTienHang,
      giamGia,
      phiGiaoHang,
      tongThanhToan,
      maKhuyenMai: maKhuyenMai || null,
      thongTinGiaoHang,
    });

    await donHang.save();

    // 🔹 Xóa giỏ hàng sau khi đặt
    await GioHang.deleteOne({ nguoiDung: userId });

    // 🔹 Gửi email xác nhận
    if (thongTinGiaoHang.email) {
      await guiEmailXacNhan(donHang, thongTinGiaoHang.email);
    }

    res.status(201).json({
      success: true,
      message: "Đặt hàng thành công! Email xác nhận đã được gửi.",
      data: donHang,
    });
  } catch (err) {
    console.error("❌ Lỗi tạo đơn hàng:", err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// 🟢 Lấy tất cả đơn hàng (admin)
exports.layTatCaDonHang = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      search = "",
      sanPham = "",
      trangThaiDon = "",
      trangThaiThanhToan = "",
    } = req.query;

    const query = {};

    // 🔍 Tìm theo mã đơn hàng
    if (search) query.maDonHang = { $regex: search, $options: "i" };

    // 🔍 Tìm theo sản phẩm
    if (sanPham) query["sanPhams.tenSP"] = { $regex: sanPham, $options: "i" };

    // 🔍 Lọc trạng thái
    if (trangThaiDon) query.trangThaiDon = trangThaiDon;
    if (trangThaiThanhToan) query.trangThaiThanhToan = trangThaiThanhToan;

    const skip = (page - 1) * limit;

    const donHangs = await DonHang.find(query)
      .populate("nguoiDung")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await DonHang.countDocuments(query);

    res.json({
      success: true,
      data: donHangs,
      total,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// 🟢 Lấy đơn hàng người dùng
exports.layDonHangNguoiDung1 = async (req, res) => {
  try {
    const donHangs = await DonHang.find({ nguoiDung: req.user._id }).sort({
      createdAt: -1,
    });
    res.json({ success: true, data: donHangs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
exports.layDonHangNguoiDung = async (req, res) => {
  try {
    const userId = req.user._id;

    // 🟢 Lấy danh sách đơn hàng của user
    const donHangs = await DonHang.find({ nguoiDung: userId })
      .sort({ createdAt: -1 });

    // 🟢 Tính thống kê đơn hàng theo tháng (12 tháng hiện tại)
    const now = new Date();
    const year = now.getFullYear();

    const stats = await DonHang.aggregate([
      {
        $match: {
          nguoiDung: userId,
          trangThaiDon: "Hoàn thành",
          trangThaiThanhToan: "Đã thanh toán",
          ngayDat: {
            $gte: new Date(`${year}-01-01`),
            $lte: new Date(`${year}-12-31`)
          }
        }
      },
      {
        $group: {
          _id: { month: { $month: "$ngayDat" } },
          tongSoDon: { $sum: 1 },
          tongTien: { $sum: "$tongThanhToan" }
        }
      },
      {
        $project: {
          _id: 0,
          month: "$_id.month",
          tongSoDon: 1,
          tongTien: 1
        }
      },
      { $sort: { month: 1 } }
    ]);

    // 🟢 Đảm bảo luôn trả về đủ 12 tháng
    const fullStats = Array.from({ length: 12 }, (_, i) => {
      const found = stats.find((s) => s.month === i + 1);
      return found || { month: i + 1, tongSoDon: 0, tongTien: 0 };
    });

    // 🟢 Gửi chung 2 phần trong 1 response
    res.json({
      success: true,
      data: {
        orders: donHangs,
        stats: fullStats,
      },
    });
  } catch (err) {
    console.error("Lỗi lấy dữ liệu:", err);
    res.status(500).json({
      success: false,
      message: "Lỗi lấy đơn hàng!"
    });
  }
};


// 🟢 Lấy chi tiết đơn hàng bằng mã đơn
exports.layChiTietDonHang = async (req, res) => {
  try {
    const { maDonHang } = req.params;
    const don = await DonHang.findOne({ maDonHang }).populate(
      "nguoiDung",
      "ten email"
    );
    if (!don)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy đơn hàng!" });
    res.json({ success: true, data: don });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 🟢 Cập nhật trạng thái đơn bằng mã đơn
exports.capNhatTrangThaiDon1 = async (req, res) => {
  try {
    const { maDonHang } = req.params;
    const { trangThaiDon, trangThaiThanhToan } = req.body;

    const don = await DonHang.findOne({ maDonHang });
    if (!don)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy đơn hàng!" });

    // 1. Ghi lại trạng thái TRƯỚC KHI cập nhật
    const daHoanThanhTruocDo =
      don.trangThaiDon === "Hoàn thành" &&
      don.trangThaiThanhToan === "Đã thanh toán";

    // 2. Cập nhật trạng thái mới vào đối tượng 'don'
    if (trangThaiDon) don.trangThaiDon = trangThaiDon;
    if (trangThaiThanhToan) don.trangThaiThanhToan = trangThaiThanhToan;

    // 3. Ghi lại trạng thái SAU KHI cập nhật
    const moiHoanThanh =
      don.trangThaiDon === "Hoàn thành" &&
      don.trangThaiThanhToan === "Đã thanh toán";

    // ✅ BLOCK 1: XỬ LÝ KHI MỚI HOÀN THÀNH (Trừ kho)
    // (Nếu trước đó CHƯA hoàn thành VÀ bây giờ MỚI hoàn thành)
    if (moiHoanThanh && !daHoanThanhTruocDo) {
      const bulkOps = don.sanPhams.map(sp => ({
        updateOne: {
          filter: { _id: sp.sanPhamId },
          update: {
            $inc: {
              soLuongTon: -sp.soLuong,
              soLuongBan: sp.soLuong,
            },
          },
        },
      }));

      if (bulkOps.length > 0) {
        await SanPham.bulkWrite(bulkOps);
      }
    }

    // ✅ BLOCK 2: XỬ LÝ KHI HỦY/HOÀN TIỀN (Cộng kho)
    // (Nếu trước đó ĐÃ hoàn thành VÀ bây giờ KHÔNG còn hoàn thành)
    if (daHoanThanhTruocDo && !moiHoanThanh) {
       const bulkOps = don.sanPhams.map(sp => ({
        updateOne: {
          filter: { _id: sp.sanPhamId },
          update: {
            $inc: {
              soLuongTon: sp.soLuong, // Hoàn lại tồn kho
              soLuongBan: -sp.soLuong, // Giảm số lượng đã bán
            },
          },
        },
      }));
       if (bulkOps.length > 0) {
        await SanPham.bulkWrite(bulkOps);
      }
    }

    // 5. Lưu đơn hàng
    await don.save();
    res.json({
      success: true,
      message: "Cập nhật trạng thái thành công!",
      data: don,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
exports.capNhatTrangThaiDon = async (req, res) => {
  try {
    const { maDonHang } = req.params;
    const { trangThaiDon, trangThaiThanhToan } = req.body;

    const don = await DonHang.findOne({ maDonHang });
    if (!don)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy đơn hàng!" });

    // 1. Ghi lại trạng thái TRƯỚC KHI cập nhật
    const daHoanThanhTruocDo =
      don.trangThaiDon === "Hoàn thành" &&
      don.trangThaiThanhToan === "Đã thanh toán";

    // 2. Cập nhật trạng thái mới vào đối tượng 'don'
    if (trangThaiDon) don.trangThaiDon = trangThaiDon;
    if (trangThaiThanhToan) don.trangThaiThanhToan = trangThaiThanhToan;

    // 3. Ghi lại trạng thái SAU KHI cập nhật
    const moiHoanThanh =
      don.trangThaiDon === "Hoàn thành" &&
      don.trangThaiThanhToan === "Đã thanh toán";
    
    let canCapNhatHang = false; // Cờ để kiểm tra xem có cần cập nhật hạng không

    // ✅ BLOCK 1: XỬ LÝ KHI MỚI HOÀN THÀNH (Trừ kho & Cộng thống kê)
    if (moiHoanThanh && !daHoanThanhTruocDo) {
      // Cập nhật kho
      const bulkOps = don.sanPhams.map(sp => ({
        updateOne: {
          filter: { _id: sp.sanPhamId },
          update: { $inc: { soLuongTon: -sp.soLuong, soLuongBan: sp.soLuong } },
        },
      }));
      if (bulkOps.length > 0) await SanPham.bulkWrite(bulkOps);

      // ✅ Cập nhật thống kê người dùng
      await NguoiDung.findByIdAndUpdate(don.nguoiDung, {
        $inc: {
          "thongKe.tongSoDonHang": 1,
          "thongKe.tongTienDaMua": don.tongThanhToan,
        },
      });
      canCapNhatHang = true; // Đánh dấu cần cập nhật hạng
    }

    // ✅ BLOCK 2: XỬ LÝ KHI HỦY/HOÀN TIỀN (Cộng kho & Trừ thống kê)
    if (daHoanThanhTruocDo && !moiHoanThanh) {
      // Hoàn kho
      const bulkOps = don.sanPhams.map(sp => ({
        updateOne: {
          filter: { _id: sp.sanPhamId },
          update: { $inc: { soLuongTon: sp.soLuong, soLuongBan: -sp.soLuong } },
        },
      }));
      if (bulkOps.length > 0) await SanPham.bulkWrite(bulkOps);

      // ✅ Cập nhật (giảm) thống kê người dùng, đảm bảo không âm
      const user = await NguoiDung.findById(don.nguoiDung);
      if (user) {
        user.thongKe.tongSoDonHang = Math.max(0, user.thongKe.tongSoDonHang - 1);
        user.thongKe.tongTienDaMua = Math.max(0, user.thongKe.tongTienDaMua - don.tongThanhToan);
        await user.save();
        canCapNhatHang = true; // Đánh dấu cần cập nhật hạng
      }
    }

    // 5. Lưu đơn hàng (với trạng thái đã cập nhật)
    await don.save();

    // ✅ BLOCK 3: CẬP NHẬT HẠNG THÀNH VIÊN (nếu cần)
    if (canCapNhatHang) {
      // Gọi hàm hỗ trợ (không cần await vì nó có thể chạy ngầm)
      capNhatHangThanhVien(don.nguoiDung); 
    }

    res.json({
      success: true,
      message: "Cập nhật trạng thái thành công!",
      data: don,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// 🟢 Xóa đơn hàng
exports.xoaDonHang = async (req, res) => {
  try {
    const { maDonHang } = req.params;
    const don = await DonHang.findOneAndDelete({ maDonHang });
    if (!don)
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy đơn hàng!" });
    res.json({ success: true, message: "Đã xóa đơn hàng!" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};



// ✉️ Hàm gửi email xác nhận
async function guiEmailXacNhan(donHang, email) {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const spHTML = donHang.sanPhams
    .map(
      (sp) => `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">${sp.tenSP}</td>
          <td style="padding:8px;border:1px solid #ddd;">${sp.soLuong}</td>
          <td style="padding:8px;border:1px solid #ddd;">${formatCurrency(
            sp.giaSauGiam
          )}</td>
          <td style="padding:8px;border:1px solid #ddd;">${formatCurrency(
            sp.thanhTien
          )}</td>
        </tr>
      `
    )
    .join("");

  const html = `
  <div style="font-family:Arial,sans-serif;background:#f9fafb;padding:20px;">
    <div style="max-width:650px;margin:auto;background:#fff;border-radius:10px;padding:24px;border:1px solid #eee;">
      <h2 style="color:#1890ff;text-align:center;">Cảm ơn bạn đã đặt hàng!</h2>
      <p>Xin chào <b>${donHang.thongTinGiaoHang.hoTen}</b>,</p>
      <p>Đơn hàng của bạn đã được tạo thành công. Dưới đây là thông tin chi tiết:</p>
      
      <div style="background:#fafafa;border-radius:8px;padding:10px 16px;margin:16px 0;">
        <p><b>Mã đơn hàng:</b> ${donHang.maDonHang}</p>
        <p><b>Ngày đặt:</b> ${new Date(
          donHang.ngayDat
        ).toLocaleString("vi-VN")}</p>
      </div>

      <table style="border-collapse:collapse;width:100%;margin-bottom:20px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="padding:8px;border:1px solid #ddd;">Sản phẩm</th>
            <th style="padding:8px;border:1px solid #ddd;">SL</th>
            <th style="padding:8px;border:1px solid #ddd;">Đơn giá</th>
            <th style="padding:8px;border:1px solid #ddd;">Thành tiền</th>
          </tr>
        </thead>
        <tbody>${spHTML}</tbody>
      </table>

      <p><b>Tổng tiền hàng:</b> ${formatCurrency(donHang.tongTienHang)}</p>
      <p><b>Giảm giá:</b> ${formatCurrency(donHang.giamGia)}</p>
      <p><b>Phí giao hàng:</b> ${formatCurrency(donHang.phiGiaoHang)}</p>
      <h3 style="color:#1890ff;">Tổng thanh toán: ${formatCurrency(
        donHang.tongThanhToan
      )}</h3>

      <p>Địa chỉ giao hàng: ${donHang.thongTinGiaoHang.diaChi}</p>
      <p style="margin-top:24px;text-align:center;color:#777;">Cảm ơn bạn đã mua sắm tại <b>Liên Hoàng Gia</b> ❤️</p>
    </div>
  </div>`;

  await transporter.sendMail({
    from: `"LHG" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: `Xác nhận đơn hàng #${donHang.maDonHang}`,
    html,
  });
}

