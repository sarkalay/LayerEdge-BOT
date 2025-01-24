import fs from "fs/promises";
import axios from "axios";
import readline from "readline";
import { getBanner } from "./config/banner.js";
import { colors } from "./config/colors.js";
import axiosProxyFix from "axios-proxy-fix"; // Import the proxy fix

const CONFIG = {
  PING_INTERVAL: 0.5,
  get PING_INTERVAL_MS() {
    return this.PING_INTERVAL * 60 * 1000;
  },
};

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true);

class WalletDashboard {
  constructor() {
    this.wallets = [];
    this.selectedIndex = 0;
    this.currentPage = 0;
    this.walletsPerPage = 5;
    this.isRunning = true;
    this.pingIntervals = new Map();
    this.walletStats = new Map();
    this.renderTimeout = null;
    this.lastRender = 0;
    this.minRenderInterval = 100;
    this.proxy = null;
  }

  // Load the proxy from proxy.txt
  async loadProxy() {
    try {
      const data = await fs.readFile("proxy.txt", "utf8");
      const proxyConfig = data.trim();
      if (proxyConfig) {
        const [usernamePassword, hostPort] = proxyConfig.split('@');
        const [username, password] = usernamePassword.split(':');
        const [host, port] = hostPort.split(':');
        
        this.proxy = `http://${username}:${password}@${host}:${port}`;
        console.log(`Using Proxy: ${this.proxy}`); // Log the proxy being used
      }
    } catch (error) {
      console.error(`${colors.error}Error reading proxy.txt: ${error}${colors.reset}`);
    }
  }

  // Create the API client with proxy support
  getApi() {
    const axiosConfig = {
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
    };

    // If proxy exists, use the axios-proxy-fix for Axios
    if (this.proxy) {
      axiosConfig.proxy = false; // Disable Axios default proxy behavior
      axiosConfig.headers['Proxy'] = this.proxy; // Attach proxy to headers
      const agent = new axiosProxyFix.Agent({
        proxy: this.proxy,
      });
      axiosConfig.httpAgent = agent; // For HTTP requests
      axiosConfig.httpsAgent = agent; // For HTTPS requests
    }

    return axios.create(axiosConfig);
  }

  async checkPoints(wallet) {
    try {
      console.log(`Checking points for wallet: ${wallet}`);
      const response = await this.getApi().get(`/node-points?wallet=${wallet}`);
      return response.data;
    } catch (error) {
      console.error(`Check points failed for wallet: ${wallet}`);
      throw new Error(`Check points failed: ${error.message}`);
    }
  }

  async updatePoints(wallet) {
    try {
      console.log(`Updating points for wallet: ${wallet}`);
      const response = await this.getApi().post("/node-points", {
        walletAddress: wallet,
        lastStartTime: Date.now(),
      });
      return response.data;
    } catch (error) {
      console.error(`Update points failed for wallet: ${wallet}`);
      if (error.response) {
        switch (error.response.status) {
          case 500:
            throw new Error("Internal Server Error");
          case 504:
            throw new Error("Gateway Timeout");
          default:
            throw new Error(`Update points failed: ${error.message}`);
        }
      }
      throw new Error(`Update points failed: ${error.message}`);
    }
  }

  async claimPoints(wallet) {
    try {
      console.log(`Claiming points for wallet: ${wallet}`);
      const response = await this.getApi().post("/claim-points", {
        walletAddress: wallet,
      });
      return response.data;
    } catch (error) {
      console.error(`Claim points failed for wallet: ${wallet}`);
      throw new Error(`Claim points failed: ${error.message}`);
    }
  }

  async startPing(wallet) {
    if (this.pingIntervals.has(wallet)) {
      return;
    }

    try {
      await this.claimPoints(wallet);
      this.walletStats.get(wallet).status = "Claimed";
    } catch (error) {
      this.walletStats.get(wallet).status = "Claim Failed";
    }

    try {
      const result = await this.updatePoints(wallet);
      const stats = this.walletStats.get(wallet);
      stats.lastPing = new Date().toLocaleTimeString();
      stats.points = result.nodePoints || stats.points;
      stats.status = "Active";
      stats.error = null;
    } catch (error) {
      const stats = this.walletStats.get(wallet);
      stats.status = "Error";
      stats.error = error.message;
    }

    const pingInterval = setInterval(async () => {
      try {
        const result = await this.updatePoints(wallet);
        const stats = this.walletStats.get(wallet);
        stats.lastPing = new Date().toLocaleTimeString();
        stats.points = result.nodePoints || stats.points;
        stats.status = "Active";
        stats.error = null;
      } catch (error) {
        const stats = this.walletStats.get(wallet);
        stats.status = "Error";
        stats.error = error.message;
      }
      this.renderDashboard();
    }, CONFIG.PING_INTERVAL_MS);

    this.pingIntervals.set(wallet, pingInterval);
    this.renderDashboard();
  }

  renderDashboard() {
    const now = Date.now();
    if (now - this.lastRender < this.minRenderInterval) {
      if (this.renderTimeout) {
        clearTimeout(this.renderTimeout);
      }
      this.renderTimeout = setTimeout(() => {
        this.actualRender();
      }, this.minRenderInterval);
      return;
    }

    this.actualRender();
  }

  actualRender() {
    this.lastRender = Date.now();
    let output = [];

    output.push("\x1b[2J\x1b[H");

    output.push(getBanner());

    const startIndex = this.currentPage * this.walletsPerPage;
    const endIndex = Math.min(
      startIndex + this.walletsPerPage,
      this.wallets.length
    );
    const totalPages = Math.ceil(this.wallets.length / this.walletsPerPage);

    for (let i = startIndex; i < endIndex; i++) {
      const wallet = this.wallets[i];
      const stats = this.walletStats.get(wallet);
      const prefix =
        i === this.selectedIndex ? `${colors.cyan}→${colors.reset} ` : "  ";
      const shortWallet = `${wallet.substr(0, 6)}...${wallet.substr(-4)}`;

      output.push(
        `${prefix}Wallet: ${colors.accountName}${shortWallet}${colors.reset}`
      );
      output.push(
        `   Status: ${this.getStatusColor(stats.status)}${stats.status}${
          colors.reset
        }`
      );
      output.push(`   Points: ${colors.info}${stats.points}${colors.reset}`);
      output.push(
        `   Last Ping: ${colors.info}${stats.lastPing}${colors.reset}`
      );
      if (stats.error) {
        output.push(`   Error: ${colors.error}${stats.error}${colors.reset}`);
      }
      output.push("");
    }

    output.push(
      `\n${colors.menuBorder}Page ${this.currentPage + 1}/${totalPages}${
        colors.reset
      }`
    );
    output.push(`\n${colors.menuTitle}Configuration:${colors.reset}`);
    output.push(
      `${colors.menuOption}Ping Interval: ${CONFIG.PING_INTERVAL} minute(s)${colors.reset}`
    );
    output.push(`\n${colors.menuTitle}Controls:${colors.reset}`);
    output.push(
      `${colors.menuOption}↑/↓: Navigate | ←/→: Change Page | Ctrl+C: Exit${colors.reset}\n`
    );

    process.stdout.write(output.join("\n"));
  }

  getStatusColor(status) {
    switch (status) {
      case "Active":
        return colors.success;
      case "Error":
        return colors.error;
      case "Claimed":
        return colors.taskComplete;
      case "Claim Failed":
        return colors.taskFailed;
      case "Starting":
        return colors.taskInProgress;
      default:
        return colors.reset;
    }
  }

  handleKeyPress(str, key) {
    const startIndex = this.currentPage * this.walletsPerPage;
    const endIndex = Math.min(
      startIndex + this.walletsPerPage,
      this.wallets.length
    );
    const totalPages = Math.ceil(this.wallets.length / this.walletsPerPage);

    if (key.name === "up" && this.selectedIndex > startIndex) {
      this.selectedIndex--;
      this.renderDashboard();
    } else if (key.name === "down" && this.selectedIndex < endIndex - 1) {
      this.selectedIndex++;
      this.renderDashboard();
    } else if (key.name === "left" && this.currentPage > 0) {
      this.currentPage--;
      this.selectedIndex = this.currentPage * this.walletsPerPage;
      this.renderDashboard();
    } else if (key.name === "right" && this.currentPage < totalPages - 1) {
      this.currentPage++;
      this.selectedIndex = this.currentPage * this.walletsPerPage;
      this.renderDashboard();
    }
  }

  async start() {
    process.on("SIGINT", function () {
      console.log(`\n${colors.info}Shutting down...${colors.reset}`);
      process.exit();
    });

    process.on("exit", () => {
      for (let [wallet, interval] of this.pingIntervals) {
        clearInterval(interval);
      }
      process.stdin.setRawMode(false);
      process.stdin.pause();
    });

    await this.loadProxy(); // Ensure proxy is loaded before initializing
    await this.initialize();
    this.renderDashboard();

    process.stdin.on("keypress", (str, key) => {
      if (key.ctrl && key.name === "c") {
        process.emit("SIGINT");
      } else {
        this.handleKeyPress(str, key);
      }
    });
  }
}

const dashboard = new WalletDashboard();
dashboard.start().catch((error) => {
  console.error(`${colors.error}Fatal error: ${error}${colors.reset}`);
  process.exit(1);
});
