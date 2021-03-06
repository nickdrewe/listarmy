angular.module('landing', [])
.controller('formCtrl', ['$scope', '$sce', '$location','$anchorScroll', 'API', 'validate', 'focus', function($scope, $sce, $location, $anchorScroll, API, validate, focus){
  $scope.state = {
    step: -1,
    loading: false,
    listName: '',
    ownerEmail: '',
    listLabel: null,
    labelRequired: false,
    infoBoxText: null,
    showInfoBox: false
  }

  $scope.next = function(){
    $scope.showInfoBox = false; // hide infoBox

    // step: 2 - List label
    if($scope.state.step == 2){
      // label not empty
      if(validate.label($scope.state.listLabel)){
        $scope.state.loading = true;
        // proceed
        var params = {
          oe: $scope.state.ownerEmail,
          ln: $scope.state.listName,
          cn: $scope.state.listLabel
        }
        // call API
        API.create(params)
        .then(function(response){
          // success
          $scope.state.loading = false;
          $scope.showInfoBox = false;

          if(response.data.success){
            // proceed to step 3
            $scope.state.step = 3;
            $location.hash('confirm');
            $anchorScroll();

            $scope.state.list = response.data;
            console.log(response);
          }else if(!response.data.success && response.data.duplicate_label){
            //duplicate label
            $scope.infoBox('You have already used the label <strong>' + $scope.state.listLabel + '</strong> for another list. Enter another label for this list!');
          }
        }, function(response){
          // error - something went wrong
          console.log('error', response)
        });
      }else{
        // invalid label
        $scope.infoBox('Enter a label containing only letters, numbers and hyphens. Max 24 characters.')
      }
    }

    // step: 1 - Email address
    if($scope.state.step == 1){
      // owner email isn't empty
      if($scope.state.ownerEmail == ''){
        // no email address
        $scope.infoBox('Enter the email address you want to use to manage your list. You\'ll use your email address to send to your subscribers and receive notifications.')
      }else if(validate.email($scope.state.ownerEmail)){
        // valid email address
        $scope.state.loading = true; // show loader
        // proceed - build params
        var params = {
          oe: $scope.state.ownerEmail,
          ln: $scope.state.listName
        }
        // call API
        API.create(params)
        .then(function(response){
          // success
          $scope.state.loading = false;

          if(response.data.success){
            // list created successfully - proceed to step 3
            $scope.state.step = 3;
            $location.hash('confirm');
            $anchorScroll();

            $scope.state.list = response.data;
            console.log(response);
          }else if(!response.data.success && response.data.label_required){
            // label required - proceed to step 2
            $scope.state.step = 2;
            $scope.infoBox('This isn\'t your first list, so you\'ll need a label to send to it e.g. <strong>list+fishing@listarmy.com</strong>')
            focus('label');
          }
        }, function(response){
          // error - something went wrong
          console.log('error', response)
        });
      }else{
        // invalid email address
        $scope.infoBox('Please enter a valid email address.')
      }
    }

    // step: 0 - List name
    if($scope.state.step == 0){
      // if user has entered a name
      if($scope.state.listName != ''){
        $scope.state.step++ // proceed
        $scope.state.showInfoBox = false; // hide infoBox
        focus('email');
      }else{
        console.log('ERR!')
        // user hasn't entered a name
        $scope.infoBox('Enter a name for your list. Make it short, but descriptive.')
      }
    }

    // step: -1 - Button
    if($scope.state.step == -1){
      $scope.state.step++;
      focus('name');
    }
  }

  // shor infobox
  $scope.infoBox = function(msg){
    $scope.state.infoBoxText = $sce.trustAsHtml(msg);
    $scope.state.showInfoBox = true;
  }
}])
.controller('pricingCtrl', ['$scope', function($scope){
  $scope.pricing = [
    {
      name: "Starter",
      price: "$12",
      subscribers: "250 - 500 subscribers",
      emails: "5,000 emails",
      email_price: "(0.24c / email)"
    },
    {
      name: "Volume",
      price: "$20",
      subscribers: "500 - 1,000 subscribers",
      emails: "10,000 emails",
      email_price: "(0.20c / email)"
    },
    {
      name: "Volume",
      price: "$45",
      subscribers: "1,000 - 2,500 subscribers",
      emails: "25,000 emails",
      email_price: "(0.18c / email)"
    },
    {
      name: "Volume",
      price: "$80",
      subscribers: "2,500 - 5,000 subscribers",
      emails: "50,000 emails",
      email_price: "(0.16c / email)"
    },
    {
      name: "Volume",
      price: "$140",
      subscribers: "5,000 - 10,000",
      emails: "100,000 emails",
      email_price: "(0.14c / email)"
    }
  ];
  $scope.displayPrice = $scope.pricing;
  $scope.priceIndex = 0;

  $scope.setDisplayPrice = function(i){
    $scope.priceIndex = i;
    if(i == 4){ i-- };
    $scope.displayPrice = $scope.pricing.slice(i, i + 2);
  }

}])
.service('API', function($http, $q){

  this.create = function(params){
    return $http({
      method: 'GET',
      url: API_URL + '/list/create',
      params: params
    })
  }
})
.service('validate', function(){
  this.email = function(email_address){
    return /[^\s@]+@[^\s@]+\.[^\s@]+/.test(email_address)
  }

  this.label = function(l){
    var testExp = /^[A-Za-z0-9-_]{1,24}$/;
    return testExp.test(l)
  }
})
.directive('focusOn', function() {
   return function(scope, elem, attr) {
      scope.$on('focusOn', function(e, name) {
        if(name === attr.focusOn) {
          elem[0].focus();
        }
      });
   };
})

.factory('focus', function ($rootScope, $timeout) {
  return function(name) {
    $timeout(function (){
      $rootScope.$broadcast('focusOn', name);
    });
  }
});
