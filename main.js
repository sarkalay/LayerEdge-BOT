const fs = require("fs");
const axios = require("axios");
const { URL } = require("url");

class LayerEdgeBot {
    constructor() {
        this.wallet = "your_wallet_address"; // Replace with your wallet address
        this.proxies = this.loadProxies();
    }

    loadProxies() {
        try {
            const proxyFileContent = fs.readFileSync("proxy.txt", "utf8");
            return proxyFileContent.split("\n").filter((line) => line.trim() !== "");
        } catch (error) {
            console.error("Error loading proxies:", error.message);
            return [];
        }
    }

    getApi() {
        const proxyConfig = {};

        if (this.proxies.length > 0) {
            const randomProxy = this.proxies[Math.floor(Math.random() * this.proxies.length)];
            const url = new URL(randomProxy);

            proxyConfig.host = url.hostname;
            proxyConfig.port = url.port || (url.protocol === "https:" ? 443 : 80);
            proxyConfig.protocol = url.protocol.replace(":", "");
            
            // Add authentication if username and password are provided
            if (url.username && url.password) {
                proxyConfig.auth = {
                    username: decodeURIComponent(url.username),
                    password: decodeURIComponent(url.password),
                };
            }
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

    async fetchData() {
        try {
            const api = this.getApi();
            const response = await api.get(`/v1/wallet/${this.wallet}`);
            console.log("Data fetched successfully:", response.data);
        } catch (error) {
            console.error("Error fetching data:", error.response?.status, error.message);
        }
    }

    async updatePoints() {
        try {
            const api = this.getApi();
            const response = await api.post(`/v1/points/${this.wallet}`);
            console.log("Points updated successfully:", response.data);
        } catch (error) {
            console.error("Error updating points:", error.response?.status, error.message);
        }
    }
}

const bot = new LayerEdgeBot();
bot.fetchData();
bot.updatePoints();
