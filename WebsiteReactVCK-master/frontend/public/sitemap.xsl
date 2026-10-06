<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="2.0" 
                xmlns:html="http://www.w3.org/TR/REC-html40"
                xmlns:sitemap="http://www.sitemaps.org/schemas/sitemap/0.9"
                xmlns:xsl="http://www.w3.org/1999/XSL/Transform">
  <xsl:output method="html" version="1.0" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html xmlns="http://www.w3.org/1999/xhtml" lang="vi">
      <head>
        <title>Sơ đồ trang web XML | Moly Course</title>
        <meta http-equiv="Content-Type" content="text/html; charset=utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <style type="text/css">
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            background-color: #f8fafc;
            color: #1e293b;
            margin: 0;
            padding: 30px 20px;
          }
          .container {
            max-width: 1020px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 16px;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05);
            padding: 32px;
            border: 1px solid #e2e8f0;
          }
          .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            border-bottom: 2px solid #f1f5f9;
            padding-bottom: 20px;
            margin-bottom: 24px;
          }
          .brand {
            display: flex;
            align-items: center;
            gap: 12px;
          }
          .brand-badge {
            background: linear-gradient(135deg, #dc2626, #991b1b);
            color: white;
            font-weight: 900;
            font-size: 14px;
            padding: 8px 14px;
            border-radius: 10px;
            letter-spacing: 1px;
          }
          .brand-title {
            font-size: 22px;
            font-weight: 800;
            color: #0f172a;
            margin: 0;
          }
          .info-box {
            background: #fef2f2;
            border: 1px solid #fee2e2;
            border-radius: 10px;
            padding: 14px 18px;
            font-size: 14px;
            color: #991b1b;
            margin-bottom: 24px;
            line-height: 1.5;
          }
          .count-badge {
            background: #e2e8f0;
            color: #334155;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 13px;
            font-weight: 700;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
          }
          th {
            background: #f8fafc;
            color: #475569;
            text-align: left;
            padding: 12px 16px;
            font-weight: 700;
            border-bottom: 2px solid #e2e8f0;
          }
          td {
            padding: 14px 16px;
            border-bottom: 1px solid #f1f5f9;
            vertical-align: middle;
          }
          tr:hover td {
            background-color: #f8fafc;
          }
          a {
            color: #dc2626;
            text-decoration: none;
            font-weight: 600;
            word-break: break-all;
          }
          a:hover {
            text-decoration: underline;
            color: #b91c1c;
          }
          .priority-pill {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 700;
            background: #ecfdf5;
            color: #047857;
          }
          .freq-pill {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: 600;
            background: #f1f5f9;
            color: #475569;
          }
          .footer {
            margin-top: 24px;
            text-align: center;
            font-size: 12px;
            color: #94a3b8;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="brand">
              <span class="brand-badge">MOLY COURSE</span>
              <h1 class="brand-title">Sơ đồ trang web XML (Sitemap)</h1>
            </div>
            <span class="count-badge">
              Tổng số URL: <xsl:value-of select="count(sitemap:urlset/sitemap:url)"/>
            </span>
          </div>

          <div class="info-box">
            Tệp này là XML Sitemap tiêu chuẩn dành riêng cho các công cụ tìm kiếm như Google, Bing và Yandex thu thập dữ liệu và lập chỉ mục tự động.
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 55%;">Đường dẫn URL</th>
                <th style="width: 15%;">Độ ưu tiên</th>
                <th style="width: 15%;">Tần suất</th>
                <th style="width: 15%;">Cập nhật lần cuối</th>
              </tr>
            </thead>
            <tbody>
              <xsl:for-each select="sitemap:urlset/sitemap:url">
                <tr>
                  <td>
                    <a href="{sitemap:loc}" target="_blank" rel="noopener noreferrer">
                      <xsl:value-of select="sitemap:loc"/>
                    </a>
                  </td>
                  <td>
                    <span class="priority-pill">
                      <xsl:value-of select="sitemap:priority"/>
                    </span>
                  </td>
                  <td>
                    <span class="freq-pill">
                      <xsl:value-of select="sitemap:changefreq"/>
                    </span>
                  </td>
                  <td style="color: #64748b; font-size: 13px;">
                    <xsl:value-of select="sitemap:lastmod"/>
                  </td>
                </tr>
              </xsl:for-each>
            </tbody>
          </table>

          <div class="footer">
            Generated by Moly Course SEO Engine • https://www.molycourse.online
          </div>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
