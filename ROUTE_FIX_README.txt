NovaCart FINAL APPLICATION Route Fix

Root cause:
The Flutter seller registration uploads documents to /api/uploads/seller-documents, but backend app.js did not mount uploadRoutes. This caused Route Not Found on SUBMIT FINAL APPLICATION.

Fixed:
- import uploadRoutes from ./routes/uploadRoutes.js
- app.use("/api/uploads", uploadRoutes)

Deploy:
1. Replace backend/src/app.js with this fixed file.
2. git add .
3. git commit -m "mount seller document upload routes"
4. git push origin main
5. Wait for Render deploy.

Then test Submit Final Application again.
