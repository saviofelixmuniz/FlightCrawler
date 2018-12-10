var db = connect("127.0.0.1:27017/flightserver");
var requestCollection = db.getCollection('requests');
var cursor = requestCollection.find({response:{$nin: [null]}});
var responses = db.getCollection('responses');

/* Modificar a quantidade de interações de acordo com sua necessidade.
    Atualmente o limite de documentos por págiina são 500.
 */
for (var pageNumber =0; pageNumber <2000000; pageNumber++){
   requestCollection.find({response:{$nin: [null]}}).skip(pageNumber).limit(500).forEach( request => {
       updateRequest(request)
   } );

}

function updateRequest(request) {
    var request = cursor.next();
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