var db = connect("127.0.0.1:27017/flightserver");
var requestCollection = db.getCollection('requests');
var responses = db.getCollection('responses');
var pageNumber = Math.ceil(requestCollection.find({response:{$nin: [null]}}) / 500);

/* Atualmente o limite de documentos por págiina são 500. */
for (var page =0; page <pageNumber; page++){
   requestCollection.find({response:{$nin: [null]}}).skip(page).limit(500).forEach( request => {
       updateRequest(request)
   } );

}

function updateRequest(request) {
    if(request.response && request.response.results){
        var newResponse = {
            results : request.response.results,
            busca: request.response.Busca,
            trechos: request.response.Trechos
        }
        var object = responses.insertOne(newResponse);
        print("Saved response");

        var newRequest = {
            company: request.company,
            http_status: request.http_status.toFixed(),
            log: request.log,
            params: request.params,
            date : request.date,
            time : request.time.toFixed(),
            response:  object.insertedId
        }
        requestCollection.update({_id: request._id}, newRequest);
        print("Updated request");
    }
}