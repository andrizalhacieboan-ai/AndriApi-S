// handler atau router untuk endpoint AI
const express = require('express');
const router = express.Router();

router.get('/api/ai/dolphin', async (req, res) => {
    try {
        // Mengambil parameter input jika user mengetik sesuatu di Console (misal: ?text=...)
        const userInput = req.query.text || req.query.query;

        // Default response seperti yang tertera di mockup terminal index.html
        let aiResult = "Karma adalah konsep bahwa setiap tindakan memiliki konsekuensi yang setara...";

        // Jika user mengirimkan parameter, kamu bisa integrasikan ke model AI asli
        // atau buat responsnya dinamis untuk keperluan testing sementara
        if (userInput) {
            aiResult = `[Dolphin AI] Kamu bertanya: "${userInput}". Ini adalah respons otomatis dari server backend untuk mencoba API Console kamu.`;
        }

        // Format JSON wajib sama persis dengan visual terminal di landing page
        return res.status(200).json({
            status: true,
            message: "Success generating response",
            data: {
                result: aiResult
            }
        });

    } catch (error) {
        // Handler jika terjadi error internal server
        return res.status(500).json({
            status: false,
            message: "Internal Server Error",
            error: error.message
        });
    }
});

module.exports = router;
