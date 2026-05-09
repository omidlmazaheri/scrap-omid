# scrap-with-btn

scrap-with-btn is a Node.js application designed to scrape web data using various libraries and APIs. This service provides a robust solution for developers to extract numerical data from web pages with minimal effort.

## Project Scope

### Overview
- The application uses Node.js-based backend solutions to scrape data.
- Supports multiple data sources such as web APIs, HTML files, etc.
- Provides processed results in structured formats (JSON).
- Includes features like error handling and rate limiting.
- Offers extensibility for integrating with external systems.

### Functionality
1. **Data Scraping**: Fetches numerical data from various web sources using libraries like axios and ejs.
2. **Data Processing**: Performs computations, aggregations, filtering, etc., on the scraped numerical data.
3. **Output Management**: Stores processed results in JSON format for easy access and integration.

### API Endpoints
- `/api/fetchAllNumbers`: Main endpoint for scraping and processing web data.
- Optional endpoints: `/api/status` (for server health metrics), `/api/logs` (for logs)

## Quick Setup

```bash
npm install axios ejs exceljs express playwright sqlite3
npm install
```

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/yourusername/scrap-with-btn.git
   cd scrap-with-btn
   ```
   
2. Install dependencies:
   ```bash
   npm install
   ```

## Running the Application

```bash
npm start
```

This will start the application on the default port (usually 3000). You can access the API endpoints through your web browser or a tool like Postman.

## Contributing

Contributions are welcome! Please fork the repository and submit pull requests for any improvements or bug fixes.