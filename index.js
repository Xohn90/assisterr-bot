(async () => {
    // 导入所需模块
    const fetch = (await import('node-fetch')).default;
    const chalk = (await import('chalk')).default;
    const fs = require('fs').promises;
    
    const CONFIG = {
      BASE_URL: "https://api.assisterr.ai",
      SLEEP_INTERVAL: 12 * 60 * 60 * 1000, // 每 12 小时
      TOKEN_FILE: "token.txt",
    };

    // 请求头模板
    let headers = {
        'Accept': 'application/json, text/plain, */*',
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': "Mozilla/5.0 (Linux; Android 8.0.0; SM-G955U Build/R16NW) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36"
    };

    // 读取令牌
    async function readTokens() {
        try {
            // 读取 token 文件
            const tokenData = await fs.readFile(CONFIG.TOKEN_FILE, 'utf-8');
            const tokens = tokenData.split('\n').filter(line => line.trim());

            // 组合账户信息
            const accounts = tokens.map((line, index) => {
                const [access_token, refresh_token] = line.split('|').map(token => token.trim());
                return { access_token, refresh_token};
            });

            return accounts;
        } catch (err) {
            console.error("读取 token 文件失败:", err.message);
            return [];
        }
    }

    // coday 函数，用于发送 HTTP 请求
    async function coday(url, method, payloadData = null, headers = headers) {
        try {
            const options = {
                method,
                headers,
                body: payloadData ? JSON.stringify(payloadData) : null
            };
            const response = await fetch(url, options);
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            return await response.json();
        } catch (error) {
            return null;
        }
    }

    async function refreshToken(refresh_token, accountIndex) {
        console.info(`正在刷新账户 ${accountIndex + 1} 的访问令牌...`);
        headers.Authorization = `Bearer ${refresh_token}`;
        const response = await coday(`${CONFIG.BASE_URL}/incentive/auth/refresh_token/`, 'POST', null, headers);

        if (response && response.access_token) {
            // 更新 token 文件
            const tokenLines = (await fs.readFile(CONFIG.TOKEN_FILE, 'utf-8')).split('\n');
            tokenLines[accountIndex] = `${response.access_token}|${response.refresh_token}`;
            await fs.writeFile('token.txt', tokenLines.join('\n'), 'utf-8');
            console.info(`账户 ${accountIndex + 1} 的令牌刷新成功`);
            return response.access_token;
        }
        console.error(`账户 ${accountIndex + 1} 的令牌刷新失败`);
        return null;
    }

    async function meInfo(headers) {
        const meInfo = await coday(`${CONFIG.BASE_URL}/incentive/users/me/`, 'GET', null, headers);
        if (meInfo && meInfo.id){
            const {username,wallet_id, points} = meInfo;
            console.log(chalk.blue(`用户名: ${username} | 钱包地址: ${wallet_id} | 积分: ${points/100}`));
            return true;
        } else {
            console.error(chalk.red(`获取用户信息失败`));
        }
        return false;
    }

    async function metaInfo(headers) {
        const metaInfo = await coday(`${CONFIG.BASE_URL}/incentive/users/me/meta/`, 'GET', null, headers);
        if (metaInfo){
            let date = new Date(metaInfo.daily_points_start_at);
            let milliseconds = date.getTime();
            milliseconds += 8 * 60 * 60 * 1000 + 60000; // 有4个小时的时区差再加上8h，预留1min误差
            if(new Date().getTime() > milliseconds)
                return true;
        } else {
            console.error(chalk.red(`获取信息失败`));
        }
        return false;
    }

    async function claim(headers) {
        const reward = await coday(`${CONFIG.BASE_URL}/incentive/users/me/daily_points/`, 'POST', null, headers);
        console.log(`reward: ${JSON.stringify(reward)}`);
        if (reward && reward.points){
            console.error(chalk.blue(`获取奖励成功`));
        } else {
            console.error(chalk.red(`获取奖励失败`));
        }
    }

    // 单个账户的主要处理流程
    async function processAccount({ access_token, refresh_token }, accountIndex) {
        headers = {
            ...headers,
            Authorization: `Bearer ${access_token}`,
        };

        if (!await meInfo(headers)) {
            console.error(`账户 ${accountIndex + 1} 获取用户信息失败，尝试刷新令牌...`);
            const newAccessToken = await refreshToken(refresh_token, accountIndex);
            if (!newAccessToken) return;
            headers.Authorization = `Bearer ${newAccessToken}`;
        }

        if (await metaInfo(headers)){
            await claim(headers);
        }
    }

    // 主函数
    async function main() {
        while (true) {
            const accounts = await readTokens();

            if (accounts.length === 0) {
                console.error("没有账户可处理。");
                return;
            }

            for (let i = 0; i < accounts.length; i++) {
                const account = accounts[i];
                console.info(`正在处理账户 ${i + 1}...`);
                await processAccount(account, i);
            }
            await new Promise(resolve => setTimeout(resolve, 5*60000)); // 每 5min 运行一次
        }
    }

    main();
})();
