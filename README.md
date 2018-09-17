#### FlightCrawler

FlightCrawler consiste em uma API para busca em sites de companhias aéreas (gol, avianca, azul e latam, até o momento), e informa quais os valores das passagens utilizando o programa de milhas, respectivo de cada companhia.

***

# Instalação

**Instale o NodeJS**:
curl -sL https://deb.nodesource.com/setup_8.x | sudo -E bash -
sudo apt-get install -y nodejs

**Install NPM or update your version (should have be more than 6.4)**:
curl https://www.npmjs.org/install.sh | sh

**Update**:
npm install npm@latest -g

**Install MongoDB**:
sudo apt update
sudo apt-get install -y mongodb

**Clone project and install packages**:
git clone https://github.com/saviofelixmuniz/FlightCrawler.git
cd (path)/FlightCrawler
npm install

**Run server**:
node server.js
