/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin from "@utils/types";

import { StockLink } from "./StockPage";

export default definePlugin({
    name: "StockPanel",
    description: "私訊側欄好友下方新增「股票」入口,開啟 TradingView 全市場股票查詢頁",
    authors: [{ name: "ontisme", id: 0n }],

    patches: [
        {
            // 私訊側欄組裝模組:children 陣列中好友項之後插入股票入口
            find: '"section-divider-top"',
            replacement: {
                match: /(?<=\},"friends"\),)/,
                replace: "$self.renderLink(),"
            }
        }
    ],

    renderLink() {
        return (
            <ErrorBoundary noop key="vc-stock-link">
                <StockLink />
            </ErrorBoundary>
        );
    }
});
