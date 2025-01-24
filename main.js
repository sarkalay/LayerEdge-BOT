const fs = require("fs");
const axios = require("axios");
const { URL } = require("url");

class LayerEdgeBot {
    constructor() {
        this.wallet = this.loadWallet(); // Load wallet address from data.txt
        this.proxies = this.loadProxies(); // Load proxies from proxy.txt
        this.pingInterval = 30000; // Ping frequency in milliseconds (default: 5 seconds)
    }

    // Load wallet address from data.txt
    loadWallet() {
        try {
            const dataFileContent = fs.readFileSync("data.txt", "utf8");
            const wallet = dataFileContent.trim();
            if (!wallet) {
                throw new Error("Wallet address is empty in data.txt");
            }
            console.log(`Wallet loaded: ${wallet}`);
            return wallet;
        } catch (error) {
            console.error("Error loading wallet address:", error.message);
            process.exit(1); // Exit the process if wallet can't be loaded
        }
    }

    // Load proxies from proxy.txt
    loadProxies() {
        try {
            const proxyFileContent = fs.readFileSync("proxy.txt", "utf8");
            const proxies = proxyFileContent
                .split("\n")
                .map((line) => line.trim())
                .filter((line) => line !== ""); // Remove empty lines
            console.log(`${proxies.length} proxies loaded.`);
            return proxies;
        } catch (error) {
            console.error("Error loading proxies:", error.message);
            return [];
        }
    }

    // Configure Axios with or without proxy
    getApi() {
        const proxyConfig = {};

        if (this.proxies.length > 0) {
            const randomProxy = this.proxies[Math.floor(Math.random() * this.proxies.length)];
            const url = new URL(randomProxy);

            proxyConfig.host = url.hostname;
            proxyConfig.port = url.port || (url.protocol === "https:" ? 443 : 80);
            proxyConfig.protocol = url.protocol.replace(":", "");

            if (url.username && url.password) {
                proxyConfig.auth = {
                    username: decodeURIComponent(url.username),
                    password: decodeURIComponent(url.password),
                };
            }

            console.log(`Using proxy: ${randomProxy}`);
        } else {
            console.log("No proxies loaded. Proceeding without a proxy.");
        }

        return axios.create({
            baseURL: "https://dashboard.layeredge.io/api",
            headers: {
                Accept: "*/*",
                "Accept-Encoding": "gzip, deflate, br",
                "Accept-Language": "en-US,en;q=0.9",
                "Content-Type": "application/json",
                Origin: "https://dashboard.layeredge.io",
                Referer: "https://dashboard.layeredge.io/",
                "User-Agent":
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
            },
            proxy: Object.keys(proxyConfig).length > 0 ? proxyConfig : false,
        });
    }

    // Fetch wallet data
    async fetchData() {
        try {
            const api = this.getApi();
            const response = await api.get(`/v1/wallet/${this.wallet}`);
            console.log("Data fetched successfully:", response.data);
        } catch (error) {
            console.error(
                "Error fetching data:",
                error.response?.status || "Unknown",
                error.message
            );
        }
    }

    // Update wallet points
    async updatePoints() {
        try {
            const api = this.getApi();
            const response = await api.post(`/v1/points/${this.wallet}`);
            console.log("Points updated successfully:", response.data);
        } catch (error) {
            console.error(
                "Error updating points:",
                error.response?.status || "Unknown",
                error.message
            );
        }
    }

    // Start the ping loop
    startPinging() {
        console.log(`Starting ping with an interval of ${this.pingInterval / 1000} seconds.`);
        setInterval(async () => {
            console.log("Pinging API...");
            await this.fetchData();
            await this.updatePoints();
        }, this.pingInterval);
    }
}

// Instantiate and start the bot
const bot = new LayerEdgeBot();
bot.startPinging();
