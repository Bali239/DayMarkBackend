import app from "./src/app.js";
import connectDB from "./src/config/db.js";
import { PORT } from "./src/config/env.js";
import client from "./src/config/googleOauthClient.js"

const startServer = async () => {
    try {
        await connectDB();
        app.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
        if(client) {
            console.log("Google OAuth Client initialized successfully.");
        } else {
            console.error("Failed to initialize Google OAuth Client.");
        }
    } catch (error) {
        console.error(`Server Error: ${error.message}`);
        process.exit(1);
    }
};

startServer();
