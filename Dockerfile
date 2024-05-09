FROM node:20.13.0 

WORKDIR /usr/src

COPY ["package.json", "package-lock.json",  "/usr/src/"]

RUN npm install

COPY [".", "/usr/src/"]

EXPOSE 4040

CMD [ "npm", "start" ]
